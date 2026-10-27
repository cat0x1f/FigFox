import { crtZoom, type CrtRenderer, type Frame, type Zoom } from './index'

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uRes;      // scene size in device pixels
uniform vec2 uScanRes;  // scene size in CSS pixels, so scanlines keep their pitch
uniform float uTime;
uniform float uPower;
uniform float uRoll;
uniform vec2 uZoom;
uniform float uBarrel;
uniform vec4 uHover;
uniform float uHoverOn;

in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 p = (vUv - 0.5) * uZoom;
  float r2 = dot(p, p);
  p *= 1.0 + uBarrel * r2;

  // A short vertical wobble while the tube settles after power on.
  p.y += uRoll * 0.022 * sin(uTime * 38.0 + p.x * 6.0);

  vec2 suv = p + 0.5;

  float mask =
    smoothstep(0.0, 0.0025, suv.x) * smoothstep(0.0, 0.0025, 1.0 - suv.x) *
    smoothstep(0.0, 0.0025, suv.y) * smoothstep(0.0, 0.0025, 1.0 - suv.y);

  // Chromatic aberration, stronger towards the corners.
  float ca = 0.00032 + r2 * 0.0022;
  vec3 col = vec3(
    texture(uTex, suv + vec2(ca, 0.0)).r,
    texture(uTex, suv).g,
    texture(uTex, suv - vec2(ca, 0.0)).b
  );

  // Cheap four tap bloom.
  vec3 bloom =
    texture(uTex, suv + vec2(0.0011, 0.0)).rgb +
    texture(uTex, suv - vec2(0.0011, 0.0)).rgb +
    texture(uTex, suv + vec2(0.0, 0.0016)).rgb +
    texture(uTex, suv - vec2(0.0, 0.0016)).rgb;
  col += bloom * 0.06;

  // Glow band behind whatever the pointer is on.
  if (uHoverOn > 0.01) {
    float hx = abs(suv.x - (uHover.x + uHover.z * 0.5)) / max(uHover.z * 0.5, 0.0005);
    float hy = abs(suv.y - (uHover.y + uHover.w * 0.5)) / max(uHover.w * 0.5, 0.0005);
    float band = 1.0 - smoothstep(0.8, 1.45, max(hx, hy));
    float pulse = 0.62 + 0.38 * sin(uTime * 9.0);
    col += vec3(0.06, 1.0, 0.24) * band * uHoverOn * 0.16 * pulse;
    col += bloom * band * uHoverOn * 0.12;
  }

  float scan = 0.80 + 0.20 * sin(suv.y * uScanRes.y * 3.14159265);
  float grille = 0.94 + 0.06 * sin(suv.x * uScanRes.x * 3.14159265);
  col *= scan * grille;
  col *= 1.0 - r2 * 0.34;

  float n = hash(suv * uRes + fract(uTime * 11.7));
  col += (n - 0.5) * 0.032;

  col = mix(col * vec3(0.90, 1.02, 0.96), col, 0.55);
  col *= uPower;
  col *= mask;

  // The case around the tube: nearly black, with a faint green spill.
  vec3 bezel = vec3(0.007, 0.009, 0.016);
  float rim = smoothstep(0.05, 0.0, min(min(suv.x, 1.0 - suv.x), min(suv.y, 1.0 - suv.y)));
  bezel += vec3(0.035, 0.10, 0.06) * rim * uPower * 0.16;
  bezel += vec3(0.015, 0.045, 0.025) * uPower * exp(-r2 * 3.0) * 0.5;

  vec3 outc = mix(bezel, col, mask);
  fragColor = vec4(outc, 1.0);
}
`

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

export function createWebGLRenderer(
  canvas: HTMLCanvasElement,
): CrtRenderer | null {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    premultipliedAlpha: false,
  })
  if (!gl) return null

  const vert = compile(gl, gl.VERTEX_SHADER, VERT)
  const frag = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vert || !frag) return null

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vert)
  gl.attachShader(program, frag)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  )
  const position = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)

  const uniforms = {
    tex: gl.getUniformLocation(program, 'uTex'),
    res: gl.getUniformLocation(program, 'uRes'),
    scanRes: gl.getUniformLocation(program, 'uScanRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    power: gl.getUniformLocation(program, 'uPower'),
    roll: gl.getUniformLocation(program, 'uRoll'),
    zoom: gl.getUniformLocation(program, 'uZoom'),
    barrel: gl.getUniformLocation(program, 'uBarrel'),
    hover: gl.getUniformLocation(program, 'uHover'),
    hoverOn: gl.getUniformLocation(program, 'uHoverOn'),
  }
  gl.uniform1i(uniforms.tex, 0)

  let textureWidth = 0
  let textureHeight = 0
  let cssWidth = 1
  let cssHeight = 1
  let zoom: Zoom = crtZoom(1, 1)

  return {
    kind: 'webgl2',
    get zoom() {
      return zoom
    },
    resize(width, height, dpr) {
      cssWidth = Math.max(1, width)
      cssHeight = Math.max(1, height)
      const w = Math.max(1, Math.floor(cssWidth * dpr))
      const h = Math.max(1, Math.floor(cssHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      zoom = crtZoom(cssWidth, cssHeight)
    },
    draw(scene, frame: Frame) {
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (scene.width !== textureWidth || scene.height !== textureHeight) {
        textureWidth = scene.width
        textureHeight = scene.height
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          scene,
        )
      } else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          scene,
        )
      }

      gl.uniform2f(uniforms.res, scene.width, scene.height)
      gl.uniform2f(uniforms.scanRes, cssWidth, cssHeight)
      gl.uniform1f(uniforms.time, frame.time)
      gl.uniform1f(uniforms.power, frame.power)
      gl.uniform1f(uniforms.roll, frame.roll)
      gl.uniform2f(uniforms.zoom, zoom.zx, zoom.zy)
      gl.uniform1f(uniforms.barrel, zoom.barrel)

      if (frame.hover) {
        gl.uniform4f(
          uniforms.hover,
          frame.hover.x,
          frame.hover.y,
          frame.hover.w,
          frame.hover.h,
        )
        gl.uniform1f(uniforms.hoverOn, 1)
      } else {
        gl.uniform4f(uniforms.hover, 0, 0, 0, 0)
        gl.uniform1f(uniforms.hoverOn, 0)
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    },
  }
}
