import { C, COLORS, GAME, RUNNER } from './config'
import type { Art } from './art'
import { Backdrop, GRASS_HEIGHT, GRASS_TOP, type BandRect } from './backdrop'
import { FOX_STRIDE, FoxPainter } from './foxdraw'
import {
  buildGroundBand,
  makeImageSprite,
  type SpriteImage,
} from './sprites'
import { JumpSound } from './sound'

const MONO = '"JetBrains Mono", ui-monospace, monospace'

/**
 * Collision box of the fox. Deliberately narrower than the drawing so a graze
 * that looks like a graze does not end the run.
 */
const FOX_HIT_W = 14
const FOX_HIT_H = 22
/** How much bigger than the sprite the fig obstacle is drawn. */
const FIG_SCALE = 1.4

export type RunnerPhase = 'intro' | 'running' | 'over' | 'outro'

interface ObstacleKind {
  sprite: SpriteImage
  width: number
  height: number
  /** How far above the grass its underside sits. */
  lift: number
}

interface Obstacle extends ObstacleKind {
  x: number
}

interface Glide {
  from: number
  to: number
  elapsed: number
  duration: number
}

/**
 * The easter egg: a one-button runner in the playfield, in the spirit of the
 * Chrome dinosaur but with the site's own fox and figs.
 *
 * Same `drawInto` contract as the screensaver, so the scene can swap between
 * them without knowing what either of them is.
 */
export class FoxRunner {
  private readonly backdrop: Backdrop
  private readonly fox: FoxPainter
  private readonly fig: ObstacleKind
  private readonly shark: ObstacleKind
  private readonly reducedMotion: boolean
  private readonly sound = new JumpSound()

  private width: number
  private frontFrames: HTMLCanvasElement[] = []
  private phase: RunnerPhase = 'running'
  private glide: Glide | null = null
  private exitedFlag = false
  private elapsed = 0
  private speed = RUNNER.startSpeed as number
  private scroll = 0
  private distance = 0
  private foxX = 0
  private foxY = 0
  private velocity = 0
  private onGround = true
  private obstacles: Obstacle[] = []
  private nextSpawn = 0
  private gait = 0
  private cloudDrift = 0
  private blinkIn = 2.5
  private blinkLeft = 0
  private overFor = 0
  private best = 0
  /** Speed the run had when it was asked to leave, for the exit glide. */
  private exitSpeed: number = RUNNER.startSpeed
  private frameHandle = 0
  private lastTime = 0
  private running = false

  constructor(width: number, options: { art: Art; reducedMotion?: boolean }) {
    this.width = Math.max(120, Math.round(width))
    this.reducedMotion = options.reducedMotion ?? false
    this.backdrop = new Backdrop(this.width, options.art.clouds)
    this.fox = new FoxPainter(options.art.fox)
    const figImage = options.art.fig
    this.fig = {
      sprite: makeImageSprite(
        figImage,
        figImage.naturalWidth,
        figImage.naturalHeight,
      ),
      width: Math.round(figImage.naturalWidth * FIG_SCALE),
      height: Math.round(figImage.naturalHeight * FIG_SCALE),
      lift: 0,
    }
    const sharkImage = options.art.shark
    this.shark = {
      sprite: makeImageSprite(
        sharkImage,
        sharkImage.naturalWidth,
        sharkImage.naturalHeight,
      ),
      width: sharkImage.naturalWidth,
      height: sharkImage.naturalHeight,
      lift: RUNNER.sharkLift,
    }
    this.foxX = this.width * RUNNER.foxX
    this.buildFront()
    this.reset()
  }

  get score(): number {
    return Math.floor(this.distance * RUNNER.metresPerPixel)
  }

  get bestScore(): number {
    return this.best
  }

  get currentPhase(): RunnerPhase {
    return this.phase
  }

  /** Seconds spent on the game-over screen. */
  get finishedFor(): number {
    return this.overFor
  }

  /** True once the fox has run back out of the field. */
  get exited(): boolean {
    return this.exitedFlag
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

  /**
   * Run into the field from `fromX`, arriving at the running position.
   * The world speeds up from a standstill while the fox moves, so the switch
   * from screensaver to game is a movement rather than a cut.
   */
  enter(fromX: number): void {
    this.reset()
    this.foxX = fromX
    this.speed = 0
    this.phase = 'intro'
    this.glide = {
      from: fromX,
      to: this.width * RUNNER.foxX,
      elapsed: 0,
      duration: RUNNER.introTime,
    }
  }

  /** Run back out to `toX`, slowing to a stop. */
  leave(toX: number): void {
    if (this.phase === 'outro' || this.phase === 'intro') return
    this.exitSpeed = this.speed
    this.phase = 'outro'
    this.glide = {
      from: this.foxX,
      to: toX,
      elapsed: 0,
      duration: RUNNER.outroTime,
    }
  }

  /** One jump. Ignored in the air, so there is no double jump. */
  jump(): void {
    if (this.phase !== 'running' || !this.onGround) return
    this.velocity = RUNNER.jumpVelocity
    this.onGround = false
    this.sound.play()
  }

  resize(width: number): void {
    const next = Math.max(120, Math.round(width))
    if (next === this.width) return
    this.width = next
    this.backdrop.resize(next)
    this.foxX = this.width * RUNNER.foxX
    this.obstacles = []
    this.nextSpawn = 0
    this.buildFront()
  }

  // ---------------------------------------------------------------- internals

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

  private reset(): void {
    this.best = Math.max(this.best, this.score)
    this.phase = 'running'
    this.glide = null
    this.exitedFlag = false
    this.elapsed = 0
    this.speed = RUNNER.startSpeed
    this.scroll = 0
    this.distance = 0
    this.foxY = 0
    this.velocity = 0
    this.onGround = true
    this.obstacles = []
    this.nextSpawn = this.speed * RUNNER.firstDelay
    this.gait = 0
    this.overFor = 0
  }

  /** Restart from the game-over screen. */
  restart(): void {
    this.reset()
  }

  /**
   * Distance to leave between obstacles. Always at least a jump and a bit, so
   * a landing never drops straight into the next one.
   */
  /**
   * Chrome's getGap(): the gap grows with the obstacle width and the speed, so
   * a faster run is not also a tighter one. The floor keeps a full jump's worth
   * of room at the very top of the speed curve.
   */
  private gapPixels(): number {
    const fraction =
      RUNNER.gapFraction *
      (1 + RUNNER.gapSpeedBias * (this.speed / RUNNER.maxSpeed))
    const gap =
      this.width * fraction * (1 + Math.random() * RUNNER.gapJitter)
    const airtime = (2 * RUNNER.jumpVelocity) / RUNNER.gravity
    return Math.max(gap, this.speed * airtime + 24)
  }

  private spawnObstacle(): void {
    const kind =
      Math.random() < RUNNER.sharkChance ? this.shark : this.fig
    this.obstacles.push({ ...kind, x: this.width + 8 })

    // A second one tucked in behind, close enough to clear in the same jump —
    // but never so many that the screen gets crowded.
    if (
      kind === this.fig &&
      this.obstacles.length + 2 <= RUNNER.maxOnScreen &&
      this.speed >= RUNNER.pairAfterSpeed &&
      Math.random() < RUNNER.pairChance
    ) {
      this.obstacles.push({
        ...this.fig,
        x: this.width + 8 + this.fig.width + RUNNER.pairGap,
      })
    }
  }

  private update(dt: number): void {
    this.elapsed += dt
    this.stepBlink(dt)

    // Legs beat at a fixed, readable rate rather than one hop per few pixels:
    // at full speed the old distance-driven cadence hit ten steps a second and
    // read as a shudder.
    const cadence = 3 + (this.speed / RUNNER.maxSpeed) * 1.6
    this.gait += dt * cadence * FOX_STRIDE
    this.cloudDrift += dt * 2.5 + this.speed * dt * 0.12

    if (this.glide) {
      this.updateGlide(dt)
      return
    }

    if (this.phase === 'over') {
      this.overFor += dt
      return
    }

    this.speed = Math.min(
      RUNNER.maxSpeed,
      RUNNER.startSpeed + this.elapsed * RUNNER.speedGain,
    )

    const step = this.speed * dt
    this.distance += step
    this.scroll += step

    if (!this.onGround) {
      this.velocity -= RUNNER.gravity * dt
      this.foxY += this.velocity * dt
      if (this.foxY <= 0) {
        this.foxY = 0
        this.velocity = 0
        this.onGround = true
      }
    }

    for (const obstacle of this.obstacles) obstacle.x -= step
    this.obstacles = this.obstacles.filter((o) => o.x + o.width > -12)

    this.nextSpawn -= step
    if (
      this.nextSpawn <= 0 &&
      this.obstacles.length < RUNNER.maxOnScreen
    ) {
      this.spawnObstacle()
      this.nextSpawn = this.gapPixels()
    }

    if (this.hits()) {
      this.phase = 'over'
      this.overFor = 0
      this.best = Math.max(this.best, this.score)
    }
  }

  /** The run in and the run out. No spawning, no collisions. */
  private updateGlide(dt: number): void {
    const glide = this.glide
    if (!glide) return

    glide.elapsed = Math.min(glide.duration, glide.elapsed + dt)
    const u = glide.duration > 0 ? glide.elapsed / glide.duration : 1
    const eased = u * u * (3 - 2 * u)

    this.foxX = glide.from + (glide.to - glide.from) * eased

    // Speed eases from a standstill up to the starting pace, or back down.
    const entering = this.phase === 'intro'
    const target = entering ? RUNNER.startSpeed : 0
    const from = entering ? 0 : this.exitSpeed
    this.speed = from + (target - from) * eased

    const step = this.speed * dt
    this.scroll += step

    if (glide.elapsed >= glide.duration) {
      this.foxX = glide.to
      this.glide = null
      if (entering) {
        this.phase = 'running'
        this.speed = RUNNER.startSpeed
        this.elapsed = 0
        this.nextSpawn = this.speed * RUNNER.firstDelay
      } else {
        this.phase = 'outro'
        this.exitedFlag = true
      }
    }
  }


  /** AABB with a couple of pixels of forgiveness on every side. */
  private hits(): boolean {
    const foxLeft = this.foxX - FOX_HIT_W / 2
    const foxRight = this.foxX + FOX_HIT_W / 2
    const foxBottom = GAME.ground - this.foxY - 3
    const foxTop = foxBottom - FOX_HIT_H

    for (const obstacle of this.obstacles) {
      const left = obstacle.x + 2
      const right = obstacle.x + obstacle.width - 2
      const bottom = GAME.ground - obstacle.lift - 2
      const top = bottom - obstacle.height + 2
      if (
        foxRight > left &&
        foxLeft < right &&
        foxBottom > top &&
        foxTop < bottom
      ) {
        return true
      }
    }
    return false
  }

  private stepBlink(dt: number): void {
    if (this.reducedMotion) return
    this.blinkLeft = Math.max(0, this.blinkLeft - dt)
    this.blinkIn -= dt
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.12
      this.blinkIn = 2.2 + Math.random() * 3.4
    }
  }

  drawInto(ctx: CanvasRenderingContext2D, rect: BandRect): void {
    // No far grass here: it would sit still behind the scrolling strip and
    // read as two layers of grass.
    this.backdrop.paint(this.elapsed, this.reducedMotion, this.cloudDrift, false)
    const smoothing = ctx.imageSmoothingEnabled
    const pixel = rect.height / GAME.height

    ctx.imageSmoothingEnabled = true
    ctx.drawImage(this.backdrop.canvas, rect.x, rect.y, rect.width, rect.height)
    ctx.imageSmoothingEnabled = false


    this.fox.draw(ctx, rect, pixel, {
      x: this.foxX,
      bottom: GAME.ground - this.foxY,
      facing: 1,
      walked: this.gait,
      airborne: !this.onGround,
      blink: this.blinkLeft > 0,
      turnPulse: 0,
      glow: 0,
    })

    // The ground scrolls: the same tileable strip, drawn twice and offset by
    // the distance covered, which is what makes the run read as forward motion.
    const sway = this.reducedMotion
      ? 0
      : Math.floor(this.elapsed / RUNNER.swayPeriod) % this.frontFrames.length
    const front = this.frontFrames[sway]
    if (front) {
      const bandHeight = GRASS_HEIGHT * pixel
      const top = rect.y + GRASS_TOP * pixel
      const offset = (this.scroll % this.width) * pixel
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(front, rect.x - offset, top, this.width * pixel, bandHeight)
      ctx.drawImage(
        front,
        rect.x + this.width * pixel - offset,
        top,
        this.width * pixel,
        bandHeight,
      )
      ctx.imageSmoothingEnabled = false
    }

    // Obstacles go in front of the near grass so a fig is never half buried.
    for (const obstacle of this.obstacles) {
      ctx.drawImage(
        obstacle.sprite.canvas,
        rect.x + obstacle.x * pixel,
        rect.y + (GAME.ground - obstacle.lift - obstacle.height) * pixel,
        obstacle.width * pixel,
        obstacle.height * pixel,
      )
    }

    ctx.imageSmoothingEnabled = smoothing

    if (this.phase === 'over') this.drawOver(ctx, rect)
  }

  private drawOver(ctx: CanvasRenderingContext2D, rect: BandRect): void {
    ctx.fillStyle = 'rgba(11, 13, 20, 0.62)'
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    const big = Math.round(Math.max(14, Math.min(30, rect.height * 0.07)))
    const small = Math.round(Math.max(10, Math.min(15, rect.height * 0.036)))
    const centreX = rect.x + rect.width / 2
    const centreY = rect.y + rect.height * 0.46

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = `700 ${big}px ${MONO}`
    ctx.fillStyle = C.paper
    ctx.fillText('GAME OVER', centreX, centreY)

    ctx.font = `400 ${small}px ${MONO}`
    ctx.fillStyle = C.green
    ctx.fillText(
      `${this.score} m   \u00b7   best ${this.best} m`,
      centreX,
      centreY + big * 1.15,
    )

    ctx.fillStyle = C.dim
    ctx.fillText(
      'space to run again  \u00b7  esc to leave',
      centreX,
      centreY + big * 1.15 + small * 1.9,
    )

    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
  }
}
