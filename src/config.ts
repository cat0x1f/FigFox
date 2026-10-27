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
