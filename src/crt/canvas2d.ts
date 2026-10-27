import type { CrtRenderer, Frame, Zoom } from './index'

const FLAT: Zoom = { zx: 1, zy: 1, barrel: 0 }

/**
 * Fallback for machines without WebGL2. The picture and every hit target stay
 * exact; only the curvature and phosphor effects go away, replaced by the CSS
 * scanline overlay in style.css.
 */
export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
): CrtRenderer | null {
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return null

  let cssWidth = 1
  let cssHeight = 1

  return {
    kind: 'canvas2d',
    get zoom() {
      return FLAT
    },
    resize(width, height, dpr) {
      cssWidth = Math.max(1, width)
      cssHeight = Math.max(1, height)
      canvas.width = Math.max(1, Math.floor(cssWidth * dpr))
      canvas.height = Math.max(1, Math.floor(cssHeight * dpr))
    },
    draw(scene, frame: Frame) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = '#05060a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(scene, 0, 0, canvas.width, canvas.height)
      if (frame.power > 1) {
        ctx.fillStyle = `rgba(180, 255, 200, ${Math.min(0.5, (frame.power - 1) * 0.5)})`
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
    },
  }
}
