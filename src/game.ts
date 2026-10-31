import { COLORS, GAME } from './config'
import type { Art } from './art'
import {
  Backdrop,
  GRASS_HEIGHT,
  GRASS_TOP,
  type BandRect,
} from './backdrop'
import { FoxPainter } from './foxdraw'
import {
  buildGroundBand,
  makeImageSprite,
  type SpriteImage,
} from './sprites'

interface Fig {
  x: number
  y: number
  speed: number
  phase: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
}

/**
 * One stretch of walking. The fox is always on one of these, so there is never
 * a frame where it is standing still.
 *
 * Position is `from + distance * ease(u)`, which pins both ends in time: the
 * fox is at `from` at u=0 and at `from + distance` at u=1 no matter what shape
 * the easing has. That is what lets the walk accelerate and settle without
 * ever breaking the appointment with a falling fig.
 */
interface Leg {
  from: number
  distance: number
  duration: number
  elapsed: number
  /** Sideways bulge off the straight line, in logical pixels. */
  arc: number
  /** Gait surges across the leg. */
  steps: number
}

export interface GameOptions {
  reducedMotion?: boolean
  art: Art
}

/** Drawn size of the fox, as a multiple of the artwork's 20px grid. */
const FOX_SCALE = 1.7
const FOX_PIXELS = 20
const FOX_DRAW = Math.round(FOX_PIXELS * FOX_SCALE)
const FOX_HALF = FOX_DRAW / 2
const FOX_TOP = GAME.ground - FOX_DRAW
/** Height at which a fig is caught: roughly the fox's mouth, not its ears. */
const CATCH_Y = FOX_TOP + Math.round(FOX_DRAW * 0.48)
/** Distance a fig falls from spawn to the catch line. */
const CATCH_FALL = CATCH_Y

/** Logical pixels per step of the walk cycle. */
const STRIDE = 22
/** Below this speed the fox is not considered to be going anywhere. */
const FACING_DEADZONE = 5
/** Shortest time a facing is held, which stops left/right flickering. */
const FACING_HOLD = 0.25
/** Length of the turn-around squash. */
const TURN_TIME = 0.12

/**
 * The fig-catching screensaver, played entirely by the fox.
 *
 * It owns a low resolution backdrop canvas for the grass and stars, but the
 * fox, the figs and the particles are drawn straight into the scene at CSS
 * resolution — at 192 logical pixels the fox moves well under one pixel per
 * frame, and rounding that to the logical grid is what used to make the walk
 * look like a slide show.
 */
export class FoxGame {
  private readonly backdrop: Backdrop
  private readonly fox: FoxPainter
  private readonly figSprite: SpriteImage
  private readonly figWidth: number
  private readonly figHeight: number
  private readonly reducedMotion: boolean

  private frontFrames: HTMLCanvasElement[] = []
  private figs: Fig[] = []
  private particles: Particle[] = []
  private width: number
  private foxX: number
  private leg: Leg
  private direction = 1
  private facing: 1 | -1 = 1
  private facingHeld = 0
  private turnPulse = 0
  private blinkIn = 2.5
  private blinkLeft = 0
  private walked = 0
  private spawnTimer = 0
  private score = 0
  private flash = 0
  private glow = 0
  private elapsed = 0
  private frameHandle = 0
  private lastTime = 0
  private running = false

  constructor(width: number, options: GameOptions) {
    this.width = Math.max(120, Math.round(width))
    this.foxX = this.width / 2
    this.leg = this.driftLeg(GAME.spawnGap / 1000)

    this.backdrop = new Backdrop(this.width, options.art.clouds)
    this.reducedMotion = options.reducedMotion ?? false

    const { fox, fig } = options.art
    this.fox = new FoxPainter(fox)

    this.figWidth = fig.naturalWidth
    this.figHeight = fig.naturalHeight
    this.figSprite = makeImageSprite(fig, this.figWidth, this.figHeight, {
      color: COLORS.figGlow,
      blur: 5,
    })

    this.buildFront()
  }

  get caught(): number {
    return this.score
  }

  /** Where the fox is standing, so other modes can take over from there. */
  get position(): number {
    return this.foxX
  }

  /** Extra phosphor brightness, used while the easter egg is being armed. */
  setGlow(value: number): void {
    this.glow = clamp(value, 0, 1)
  }

  /** Resize the logical field, keeping the fox roughly where it was. */
  resize(width: number): void {
    const next = Math.max(120, Math.round(width))
    if (next === this.width) return
    const ratio = next / this.width
    this.width = next
    this.backdrop.resize(next)
    this.foxX = clamp(this.foxX * ratio, this.minX(), this.maxX())
    // Anything in flight was aimed at the old geometry; start clean.
    this.figs = []
    this.leg = this.driftLeg(0.4)
    this.spawnTimer = 0
    this.buildFront()
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min((now - this.lastTime) / 1000, 0.05)
      this.lastTime = now
      this.update(dt)
      this.frameHandle = requestAnimationFrame(loop)
    }
    this.frameHandle = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.frameHandle)
  }

  // ---------------------------------------------------------------- internals

  private minX(): number {
    return FOX_HALF + 10
  }

  private maxX(): number {
    return this.width - FOX_HALF - 10
  }

  private buildFront(): void {
    const palette = {
      bright: COLORS.grass,
      mid: COLORS.grassMid,
      dark: COLORS.grassDark,
    }
    this.frontFrames = [0, 1, 2].map((frame) =>
      buildGroundBand(this.width, GRASS_HEIGHT, 500 + frame * 83, palette),
    )
  }

  /** A short wander in the current direction, used between figs. */
  private driftLeg(duration: number): Leg {
    const span = Math.max(1, this.maxX() - this.minX())
    let distance = this.direction * GAME.speed * duration * 0.7
    const landing = clamp(this.foxX + distance, this.minX(), this.maxX())
    distance = landing - this.foxX
    if (Math.abs(distance) < 1) {
      this.direction = (-this.direction || 1) as 1 | -1
      distance = this.direction * Math.min(span, GAME.speed * duration * 0.7)
    }
    return {
      from: this.foxX,
      distance,
      duration: Math.max(0.1, duration),
      elapsed: 0,
      arc: 0,
      steps: Math.max(1, Math.round(Math.abs(distance) / STRIDE)),
    }
  }

  private update(dt: number): void {
    this.elapsed += dt
    this.stepWalk(dt)
    this.stepBlink(dt)

    if (this.figs.length === 0) {
      this.spawnTimer = Math.max(0, this.spawnTimer - dt * 1000)
      if (this.spawnTimer <= 0) this.spawnFig()
    }

    const catchTop = CATCH_Y
    const catchBottom = CATCH_Y + 14

    this.figs = this.figs.filter((fig) => {
      fig.phase += dt * 3
      fig.y += fig.speed * dt

      const bottom = fig.y + this.figHeight
      const centreX = fig.x + this.figWidth / 2
      const inReach = Math.abs(centreX - this.foxX) < FOX_HALF + 2

      if (inReach && bottom >= catchTop && fig.y < catchBottom) {
        this.collect(fig)
        return false
      }

      if (bottom >= GAME.height - 6) {
        this.spill(fig)
        return false
      }
      return true
    })

    this.particles = this.particles.filter((particle) => {
      particle.life -= dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += 150 * dt
      return particle.life > 0
    })

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5)
    if (this.turnPulse > 0) {
      this.turnPulse = Math.max(0, this.turnPulse - dt / TURN_TIME)
    }
    this.facingHeld += dt
  }

  /** Blinks are their own thing, not a step of the walk. */
  private stepBlink(dt: number): void {
    if (this.reducedMotion) return
    this.blinkLeft = Math.max(0, this.blinkLeft - dt)
    this.blinkIn -= dt
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.13
      this.blinkIn = 2.4 + Math.random() * 4
    }
  }

  private stepWalk(dt: number): void {
    const leg = this.leg
    leg.elapsed += dt

    // A finished leg with nothing to chase means the gap between figs ran long;
    // roll straight into another drift so the fox never parks.
    if (leg.elapsed >= leg.duration && this.figs.length === 0) {
      this.foxX = clamp(leg.from + leg.distance, this.minX(), this.maxX())
      this.leg = this.driftLeg(0.5)
      return
    }

    const u = clamp(leg.elapsed / leg.duration, 0, 1)
    const envelope = Math.sin(Math.PI * u)
    const arc = this.reducedMotion ? 0 : envelope * leg.arc

    // The walk surges inside each step but never reverses: the sine term is
    // small enough that even the easing's slowest point stays forward.
    const surge =
      (0.18 / (Math.PI * 2 * leg.steps)) *
      Math.sin(Math.PI * 2 * leg.steps * u)

    const next = clamp(
      leg.from + leg.distance * (ease(u) + surge) + arc,
      this.minX(),
      this.maxX(),
    )
    const moved = next - this.foxX
    this.foxX = next
    this.walked += Math.abs(moved)

    const velocity = moved / Math.max(dt, 0.0001)
    if (Math.abs(velocity) > FACING_DEADZONE) {
      const wanted: 1 | -1 = velocity > 0 ? 1 : -1
      if (wanted !== this.facing && this.facingHeld >= FACING_HOLD) {
        this.facing = wanted
        this.facingHeld = 0
        this.turnPulse = 1
      }
    }
  }

  /**
   * Pick a landing spot on either side of the fox and start a leg that arrives
   * exactly as the fig does.
   */
  private spawnFig(): void {
    const figSpeed = GAME.speed * (0.94 + Math.random() * 0.12)
    const fallTime = CATCH_FALL / figSpeed

    const minDistance = GAME.reachMin * GAME.speed * fallTime
    const maxDistance = GAME.reachMax * GAME.speed * fallTime

    const roomLeft = this.foxX - this.minX()
    const roomRight = this.maxX() - this.foxX
    const room = Math.max(roomLeft, roomRight)
    const want = Math.min(
      room,
      minDistance + Math.random() * (maxDistance - minDistance),
    )

    // Pick a side, then make sure that side actually has room for the whole
    // step. Without this the landing gets clamped short and the fox arrives
    // early, leaving it standing while the fig catches up.
    let sign = Math.random() < 0.5 ? -1 : 1
    if ((sign < 0 && roomLeft < want) || (sign > 0 && roomRight < want)) {
      sign = -sign
    }
    const landing = clamp(this.foxX + sign * want, this.minX(), this.maxX())
    const distance = landing - this.foxX

    // Keep the bulge inside the field so it never has to be clamped away.
    const headroom = Math.min(this.foxX - this.minX(), this.maxX() - this.foxX)
    const arcAmplitude = Math.min(5, Math.max(0, headroom - 2))

    this.leg = {
      from: this.foxX,
      distance,
      duration: fallTime,
      elapsed: 0,
      arc:
        (Math.random() < 0.5 ? -1 : 1) *
        arcAmplitude *
        (0.4 + Math.random() * 0.6),
      steps: Math.max(1, Math.round(Math.abs(distance) / STRIDE)),
    }
    this.direction = distance >= 0 ? 1 : -1

    this.figs.push({
      x: clamp(landing - this.figWidth / 2, 2, this.width - this.figWidth - 2),
      y: -this.figHeight,
      speed: figSpeed,
      phase: Math.random() * Math.PI * 2,
    })
  }

  /** After a fig resolves, drift on with the pace it arrived at. */
  private handOff(): void {
    const gap = GAME.spawnGap / 1000
    this.spawnTimer = GAME.spawnGap
    this.leg = this.driftLeg(gap)
  }

  private collect(fig: Fig): void {
    this.score += 1
    this.flash = 1
    this.burst(
      fig.x + this.figWidth / 2,
      fig.y + this.figHeight / 2,
      COLORS.fig,
      6,
      55,
    )
    this.handOff()
  }

  private spill(fig: Fig): void {
    this.burst(
      fig.x + this.figWidth / 2,
      GAME.height - 10,
      COLORS.grassMid,
      4,
      30,
    )
    this.handOff()
  }

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    power: number,
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = power * (0.3 + Math.random() * 0.7)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - power * 0.6,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        color,
      })
    }
  }

  // ------------------------------------------------------------------ render

  /**
   * Draw the playfield into `rect`, which is in the scene's CSS pixels.
   *
   * The grass and stars are rendered at the logical resolution and stretched;
   * everything that moves is drawn directly in CSS pixels so its position is
   * not quantised to the coarse grid. The fox goes between two grass layers,
   * so it stands in the grass rather than on top of it.
   */
  drawInto(ctx: CanvasRenderingContext2D, rect: BandRect): void {
    this.backdrop.paint(this.elapsed, this.reducedMotion, this.elapsed * 2.5)

    const smoothing = ctx.imageSmoothingEnabled
    const pixel = rect.height / GAME.height

    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.backdrop.canvas, rect.x, rect.y, rect.width, rect.height)
    ctx.imageSmoothingEnabled = false

    for (const fig of this.figs) {
      this.blit(
        ctx,
        this.figSprite,
        rect.x + (fig.x + this.figWidth / 2) * pixel,
        rect.y + (fig.y + this.figHeight) * pixel,
        this.figWidth * pixel,
        this.figHeight * pixel,
      )
    }

    this.fox.draw(ctx, rect, pixel, {
      x: this.foxX,
      bottom: GAME.ground,
      facing: this.facing,
      walked: this.walked,
      airborne: false,
      blink: this.blinkLeft > 0,
      turnPulse: this.reducedMotion ? 0 : this.turnPulse,
      glow: this.glow,
    })

    // The near grass is drawn after the fox, so it covers its paws.
    const sway = this.reducedMotion
      ? 0
      : Math.floor(this.elapsed / 0.55) % this.frontFrames.length
    const front = this.frontFrames[sway]
    if (front) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(
        front,
        rect.x,
        rect.y + GRASS_TOP * pixel,
        rect.width,
        GRASS_HEIGHT * pixel,
      )
      ctx.imageSmoothingEnabled = false
    }

    ctx.imageSmoothingEnabled = smoothing

    for (const particle of this.particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
      ctx.fillStyle = particle.color
      ctx.fillRect(
        rect.x + particle.x * pixel,
        rect.y + particle.y * pixel,
        Math.max(1, pixel),
        Math.max(1, pixel),
      )
    }
    ctx.globalAlpha = 1

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(200, 240, 255, ${(this.flash * 0.04).toFixed(3)})`
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height)
    }
  }

  /**
   * Draw a sprite so its artwork lands on (centreX, bottomY) at the given CSS
   * size, with the baked glow margin scaled to match.
   */
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Quarter linear, three quarters smoothstep: eases in and out, but the ends
 * keep a quarter of the average speed so the fox never comes to a stop.
 */
function ease(u: number): number {
  const smooth = u * u * (3 - 2 * u)
  return 0.25 * u + 0.75 * smooth
}
