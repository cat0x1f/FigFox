import { COLORS, GAME } from './config'
import { buildGrass, mulberry32 } from './sprites'

export const GRASS_HEIGHT = 26
export const GRASS_TOP = GAME.height - GRASS_HEIGHT

export interface BandRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The sky and the two grass layers, rendered once at the logical resolution and
 * stretched into the band. Shared by the fig-catching screensaver and the
 * runner so both modes sit in exactly the same meadow.
 */
export class Backdrop {
  readonly canvas: HTMLCanvasElement

  private readonly ctx: CanvasRenderingContext2D
  private width: number
  private grassFrames: HTMLCanvasElement[] = []
  private stars: Array<{ x: number; y: number; phase: number }> = []

  private readonly clouds: HTMLImageElement[]
  private cloudSlots: Array<{ image: HTMLImageElement; x: number; y: number }> = []

  constructor(width: number, clouds: HTMLImageElement[] = []) {
    this.clouds = clouds
    this.width = Math.max(1, Math.round(width))
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.width
    this.canvas.height = GAME.height
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context is unavailable')
    this.ctx = ctx
    this.build()
  }

  resize(width: number): void {
    const next = Math.max(1, Math.round(width))
    if (next === this.width) return
    this.width = next
    this.canvas.width = next
    this.build()
  }

  paint(
    elapsed: number,
    reducedMotion: boolean,
    drift = 0,
    withGrass = true,
  ): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.width, GAME.height)

    // Clouds first, well behind everything.
    const span = this.width + 120
    for (const slot of this.cloudSlots) {
      const raw = (((slot.x - drift) % span) + span) % span
      ctx.drawImage(slot.image, Math.round(raw - 60), slot.y)
    }

    for (const star of this.stars) {
      const twinkle = reducedMotion
        ? 0.22
        : 0.14 + 0.18 * (0.5 + 0.5 * Math.sin(elapsed * 0.9 + star.phase))
      ctx.fillStyle = `rgba(158, 206, 106, ${twinkle.toFixed(3)})`
      ctx.fillRect(star.x, star.y, 1, 1)
    }

    if (!withGrass) return
    const sway = reducedMotion
      ? 0
      : Math.floor(elapsed / 0.55) % this.grassFrames.length
    const grass = this.grassFrames[sway]
    if (grass) ctx.drawImage(grass, 0, GRASS_TOP)
  }

  /** A fixed handful of clouds, wrapped across a slightly wider span. */
  private buildClouds(): void {
    this.cloudSlots = []
    if (this.clouds.length === 0) return
    const random = mulberry32(31)
    const count = Math.max(2, Math.round(this.width / 150))
    const span = this.width + 120
    for (let i = 0; i < count; i += 1) {
      const image = this.clouds[Math.floor(random() * this.clouds.length)]
      if (!image) continue
      this.cloudSlots.push({
        image,
        x: (span * (i + 0.5)) / count + (random() - 0.5) * 40,
        y: Math.round(18 + random() * (GRASS_TOP - 110)),
      })
    }
  }

  private build(): void {
    const random = mulberry32(7)
    const count = Math.round(this.width / 30)
    this.stars = []
    for (let i = 0; i < count; i += 1) {
      this.stars.push({
        x: Math.round(8 + random() * (this.width - 16)),
        y: Math.round(6 + random() * (GRASS_TOP - 40)),
        phase: random() * Math.PI * 2,
      })
    }

    this.buildClouds()

    const palette = {
      bright: COLORS.grass,
      mid: COLORS.grassMid,
      dark: COLORS.grassDark,
    }
    this.grassFrames = [0, 1, 2].map((frame) =>
      buildGrass(this.width, GRASS_HEIGHT, 1000 + frame * 97, palette),
    )
  }
}
