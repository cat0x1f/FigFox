export interface Zoom {
  zx: number
  zy: number
  barrel: number
}

export interface HoverRect {
  /** Normalised to the scene: 0..1. */
  x: number
  y: number
  w: number
  h: number
}

export interface Frame {
  power: number
  roll: number
  time: number
  hover: HoverRect | null
}

export interface CrtRenderer {
  readonly kind: 'webgl2' | 'canvas2d'
  readonly zoom: Zoom
  resize(cssWidth: number, cssHeight: number, dpr: number): void
  draw(scene: HTMLCanvasElement, frame: Frame): void
}

/**
 * The tube is slightly inset from the window edge and bulges outwards, which is
 * what makes the picture read as glass rather than a rectangle of text.
 */
export function crtZoom(width: number, height: number): Zoom {
  const mx = clamp(16 / Math.max(width, 1), 0.018, 0.038)
  const my = clamp(14 / Math.max(height, 1), 0.02, 0.046)
  return {
    zx: 1 / (1 - 2 * mx),
    zy: 1 / (1 - 2 * my),
    barrel: height < 480 ? 0.11 : 0.14,
  }
}

/**
 * Invert the tube transform: window coordinates to scene coordinates, in
 * CSS pixels. This is the same curve the shader applies, so hit tests land
 * exactly on the glyphs that were drawn.
 */
export function screenToScene(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  zoom: Zoom,
  sceneWidth: number,
  sceneHeight: number,
): { x: number; y: number } | null {
  const ux = (clientX - rect.left) / rect.width
  const uy = (clientY - rect.top) / rect.height
  let px = (ux - 0.5) * zoom.zx
  let py = (uy - 0.5) * zoom.zy
  const r2 = px * px + py * py
  px *= 1 + zoom.barrel * r2
  py *= 1 + zoom.barrel * r2
  const sx = px + 0.5
  const sy = py + 0.5
  if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null
  return { x: sx * sceneWidth, y: sy * sceneHeight }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
