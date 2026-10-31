/**
 * Tokyo Night phosphor. Everything on screen comes from this table.
 */
export const C = {
  bg: '#0b0d14',
  green: '#9ece6a',
  hot: '#00ff41',
  cyan: '#7dcfff',
  paper: '#c0caf5',
  dim: '#565f89',
  ink: '#a9b1d6',
} as const

export const GAME = {
  /** Logical height of the play field. Width follows the viewport. */
  height: 192,
  /** Where the fox stands, in logical pixels from the top of the field. */
  ground: 182,
  /**
   * Base speed. Each fig picks a landing spot, and the fox walks there at
   * whatever pace gets it there exactly as the fig lands: somewhere between
   * `reachMin` and `reachMax` times this speed.
   */
  speed: 46,
  /** How far from the fox a fig may land, as a multiple of the fall distance. */
  reachMin: 0.55,
  reachMax: 1.35,
  /** Pause between one fig landing and the next one appearing, in ms. */
  spawnGap: 420,
} as const

/** The easter-egg runner. All distances are logical pixels. */
export const RUNNER = {
  /**
   * Ported from the Chrome dinosaur's own numbers, scaled to a 34px-tall fox:
   * 45px high, 0.467s in the air.
   */
  jumpVelocity: 386,
  gravity: 1651,
  startSpeed: 190,
  maxSpeed: 420,
  /** Pixels per second gained per second elapsed — about 80s to the top. */
  speedGain: 2.9,
  /**
   * Spacing is measured in fractions of the field, because that is what the
   * player actually sees: the original never has more than three obstacles on
   * screen. The fraction grows a little with speed.
   */
  gapFraction: 0.3,
  gapSpeedBias: 0.5,
  gapJitter: 0.45,
  /** Never more than this many obstacles on screen at once. */
  maxOnScreen: 3,
  /** Chance an obstacle is a shark instead of a fig. */
  sharkChance: 0.35,
  /** How far above the grass a shark swims, in logical px. */
  sharkLift: 4,
  /**
   * Seconds per sway frame. The ground is scrolling, so morphing the tufts at
   * the idle cadence reads as flicker; this keeps it as a slow breathing.
   */
  swayPeriod: 1.9,
  /** A second fig tucked in behind the first, this often. */
  pairChance: 0.3,
  /** Pairs only start once the run has some speed behind it. */
  pairAfterSpeed: 280,
  /** Clear space between the two figs of a pair. */
  pairGap: 8,
  /** Empty running before the first obstacle appears. */
  firstDelay: 1.2,
  /** Fox position as a fraction of the field width. */
  foxX: 0.22,
  metresPerPixel: 0.1,
  /** Seconds of no input after a crash before going back to the screensaver. */
  overHold: 10,
  /** Seconds the fox takes to run into place and back out. */
  introTime: 0.5,
  outroTime: 0.45,
} as const

export const COLORS = {
  grass: '#9ece6a',
  grassMid: '#74a355',
  grassDark: '#4e7a3c',
  /** Halo baked behind the fox sprites (their own colours come from the PNGs). */
  foxGlow: 'rgba(150, 200, 150, 0.5)',
  fig: '#f7768e',
  figCore: '#ffd0d8',
  figStem: '#9ece6a',
  figGlow: 'rgba(247, 118, 142, 0.65)',
  /** Sprite outline, darker than the scene so shapes hold up over grass. */
  outline: '#070910',
} as const
