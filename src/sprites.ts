/**
 * Sprite plumbing and the grass.
 *
 * All artwork is PNG (see tools/build-sprites.mjs); this module only bakes the
 * phosphor glow around those images and grows the two grass layers.
 */

export interface SpriteImage {
  readonly canvas: HTMLCanvasElement
  readonly width: number
  readonly height: number
  /** Transparent margin added for the glow, in pixels. */
  readonly pad: number
}

export interface GlowOptions {
  color: string
  blur: number
}

interface GrassColors {
  bright: string
  mid: string
  dark: string
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.imageSmoothingEnabled = false
  return ctx
}

/**
 * Bakes a glow under an already drawn image (a PNG, a canvas) so the main loop
 * only has to blit one bitmap per frame.
 */
export function makeImageSprite(
  source: CanvasImageSource,
  width: number,
  height: number,
  glow?: GlowOptions,
): SpriteImage {
  const pad = glow ? Math.ceil(glow.blur) : 0
  const canvas = createCanvas(width + pad * 2, height + pad * 2)
  const ctx = context2d(canvas)

  if (glow) {
    ctx.shadowColor = glow.color
    ctx.shadowBlur = glow.blur
    ctx.drawImage(source, pad, pad)
    ctx.shadowBlur = glow.blur / 2.4
    ctx.drawImage(source, pad, pad)
    ctx.shadowBlur = 0
  }

  ctx.drawImage(source, pad, pad)
  return { canvas, width, height, pad }
}

/** Deterministic pseudo-random source so the grass never reshuffles on resize. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface GrassLayer {
  color: string
  minHeight: number
  maxHeight: number
  /** Width of each tuft in pixels. Wider tufts read as clumps. */
  step: number
}

/**
 * The near grass: a dense band drawn *after* the fox, so its paws are buried
 * in grass instead of standing on the line. Kept shorter than the far layer so
 * the fox still reads.
 */
export function buildGrassFront(
  width: number,
  height: number,
  seed: number,
  colors: GrassColors,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const random = mulberry32(seed)
  const baseY = height

  ctx.fillStyle = colors.dark
  ctx.fillRect(0, baseY - 7, width, 7)

  const humps = (color: string, minHeight: number, maxHeight: number, step: number) => {
    ctx.fillStyle = color
    for (let x = -step; x < width; x += step) {
      const size =
        minHeight + Math.floor(random() * (maxHeight - minHeight + 1))
      for (let k = 0; k < step; k += 1) {
        const px = x + k
        if (px < 0 || px >= width) continue
        const rise = Math.round(Math.sin((k / step) * Math.PI) * size)
        if (rise <= 0) continue
        ctx.fillRect(px, baseY - rise, 1, rise)
      }
    }
  }

  humps(colors.mid, 9, 16, 9)
  humps(colors.bright, 6, 12, 6)

  // Taller blades that break the outline and actually cover a paw or two.
  ctx.fillStyle = colors.bright
  for (let i = 0; i < Math.round(width / 9); i += 1) {
    const x = Math.floor(random() * width)
    const tall = 12 + Math.floor(random() * 8)
    const lean = random() < 0.5 ? -1 : 1
    for (let h = 0; h < tall; h += 1) {
      const px = x + Math.round(h / 6) * lean
      if (px < 0 || px >= width) break
      ctx.fillRect(px, baseY - 1 - h, 1, 1)
      if (h > 3 && h % 4 === 0) ctx.fillRect(px + lean, baseY - h, 1, 1)
    }
  }

  return canvas
}

/**
 * One frame of the far grass band. Three frames are cycled slowly in the game
 * loop to give the tufts a gentle sway without redrawing every blade.
 *
 * The band is anchored to the bottom of the canvas, so the top edge is where
 * the tallest blades poke out.
 */
export function buildGrass(
  width: number,
  height: number,
  seed: number,
  colors: GrassColors,
): HTMLCanvasElement {
  const canvas = createCanvas(width, height)
  const ctx = context2d(canvas)
  const random = mulberry32(seed)
  const baseY = height

  const layers: GrassLayer[] = [
    { color: colors.dark, minHeight: 12, maxHeight: 19, step: 10 },
    { color: colors.mid, minHeight: 8, maxHeight: 14, step: 7 },
    { color: colors.bright, minHeight: 5, maxHeight: 10, step: 4 },
  ]

  for (const layer of layers) {
    ctx.fillStyle = layer.color
    for (let x = -layer.step; x < width; x += layer.step) {
      const size =
        layer.minHeight +
        Math.floor(random() * (layer.maxHeight - layer.minHeight + 1))
      for (let k = 0; k < layer.step; k += 1) {
        const px = x + k
        if (px < 0 || px >= width) continue
        const rise = Math.round(Math.sin((k / layer.step) * Math.PI) * size)
        if (rise <= 0) continue
        ctx.fillRect(px, baseY - rise, 1, rise)
      }
    }
  }

  // A few blades that break the silhouette of the tufts.
  ctx.fillStyle = colors.bright
  for (let i = 0; i < Math.round(width / 10); i += 1) {
    const x = Math.floor(random() * width)
    const tall = 10 + Math.floor(random() * 6)
    const lean = random() < 0.5 ? -1 : 1
    for (let h = 0; h < tall; h += 1) {
      const px = x + Math.round(h / 6) * lean
      if (px < 0 || px >= width) break
      ctx.fillRect(px, baseY - 1 - h, 1, 1)
      if (h > 2 && h % 4 === 0) ctx.fillRect(px + lean, baseY - h, 1, 1)
    }
  }

  return canvas
}
