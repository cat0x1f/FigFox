import { COLORS } from './config'
import { FOX_PIXELS, type FoxArt } from './art'
import type { BandRect } from './backdrop'
import { makeImageSprite, type SpriteImage } from './sprites'

/** Logical pixels per step of the walk cycle. */
export const FOX_STRIDE = 22
/** How far the fox lifts off the grass at the top of a step. */
const HOP = 3.2

export interface FoxDrawState {
  /** Logical centre of the fox. */
  x: number
  /** Logical y of the bottom of the feet. */
  bottom: number
  facing: 1 | -1
  /** Logical distance walked; drives the hop cycle. */
  walked: number
  /** In the air: no hop, no squash. */
  airborne: boolean
  blink: boolean
  /** 0 = settled, 1 = mid turn. */
  turnPulse: number
  /** Extra phosphor brightness, 0..1. */
  glow: number
}

/**
 * Draws the fox. Owns nothing about what the fox is doing — the screensaver and
 * the runner both describe a position and a mood, and get the same character.
 */
export class FoxPainter {
  private readonly sprites: Record<string, SpriteImage> = {}

  constructor(art: FoxArt) {
    const glow = { color: COLORS.foxGlow, blur: 3.5 }
    const sources: Record<string, HTMLImageElement> = {
      'front:open': art.open,
      'front:closed': art.closed,
      'turned:open': art.openTurn,
      'turned:closed': art.closedTurn,
    }
    for (const [key, image] of Object.entries(sources)) {
      this.sprites[key] = makeImageSprite(image, FOX_PIXELS, FOX_PIXELS, glow)
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    rect: BandRect,
    pixel: number,
    state: FoxDrawState,
  ): void {
    const turning = state.turnPulse > 0.5
    const key = `${turning ? 'front' : 'turned'}:${state.blink ? 'closed' : 'open'}`
    const sprite = this.sprites[key]
    if (!sprite) return

    // One continuous hop per step. Airborne the pose is neutral.
    const phase = state.walked / FOX_STRIDE
    const hop = state.airborne ? 1 : Math.abs(Math.sin(Math.PI * phase))
    const lift = state.airborne ? 0 : -hop * HOP
    const squash = 1 + 0.07 * (1 - hop)
    const stretch = 1 - 0.06 * (1 - hop)
    const turnSquash = 1 - 0.22 * state.turnPulse

    const unit = pixel * 1.7
    const artWidth = FOX_PIXELS * unit * squash * turnSquash
    const artHeight = FOX_PIXELS * unit * stretch
    const centreX = rect.x + state.x * pixel
    const bottomY = rect.y + (state.bottom + lift) * pixel

    ctx.save()
    if (state.facing < 0) {
      ctx.translate(centreX * 2, 0)
      ctx.scale(-1, 1)
    }
    this.blit(ctx, sprite, centreX, bottomY, artWidth, artHeight)

    if (state.glow > 0.01) {
      // Additive pass: the phosphor brightens without changing the artwork.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = Math.min(1, state.glow * 0.75)
      this.blit(ctx, sprite, centreX, bottomY, artWidth, artHeight)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }

  /** Places the artwork so its feet land on (centreX, bottomY). */
  private blit(
    ctx: CanvasRenderingContext2D,
    sprite: SpriteImage,
    centreX: number,
    bottomY: number,
    artWidth: number,
    artHeight: number,
  ): void {
    const unitX = artWidth / sprite.width
    const unitY = artHeight / sprite.height
    const padX = sprite.pad * unitX
    const padY = sprite.pad * unitY
    ctx.drawImage(
      sprite.canvas,
      centreX - artWidth / 2 - padX,
      bottomY - artHeight - padY,
      sprite.canvas.width * unitX,
      sprite.canvas.height * unitY,
    )
  }
}
