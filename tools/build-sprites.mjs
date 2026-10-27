#!/usr/bin/env node
/**
 * Rebuild the sprite PNGs the site loads.
 *
 *   node tools/build-sprites.mjs
 *
 * Two sources, two very different treatments:
 *
 *  · assets/fox.psd is pixel art on a 20x20 grid. Each 15px cell is sampled,
 *    snapped to the artwork's own six colours, and written out with
 *    transparency. Also derives the 3/4 turned pair (face slid two cells
 *    towards the walk, far ear trimmed) — the only mutation of the original.
 *
 *  · src/assets/fig.png is a high resolution drawing. It is trimmed and area
 *    averaged down to a 18x21 sprite, which keeps the cut face readable at
 *    the size the game draws it.
 *
 * Needs ImageMagick (`magick`) on PATH. The fox step is skipped with a warning
 * if the PSD is not present.
 */
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const psd = join(root, 'assets/fox.psd')
const figSource = join(root, 'src/assets/fig.png')

// --------------------------------------------------------------------- fox ---

const SIZE = 300
const CELLS = 20
const CELL = SIZE / CELLS
const FRAMES = 4

/** The fox artwork's own palette, sampled from the PSD. */
const PALETTE = [
  { key: 'K', rgb: [0, 0, 0] },
  { key: 'G', rgb: [147, 169, 121] },
  { key: 'D', rgb: [84, 106, 72] },
  { key: 'C', rgb: [252, 250, 251] },
  { key: 'T', rgb: [65, 123, 103] },
  { key: 'S', rgb: [160, 164, 150] },
]

/**
 * The 3/4 turn. Each entry rewrites one row of the face: eyes, whiskers and
 * cheek spot move two cells towards the walking side, far ear loses a cell.
 */
const TURN = {
  closed: {
    3: '.......KK...KK.KCCK.',
    4: '...KGGGK...KGGKKCCKK',
    7: '..KGGGGGGGGSGGGGKDDK',
    10: 'KCCCCCKKKCKKCKKCCCKK',
  },
  open: {
    2: '.......KK...KK.KCCK.',
    3: '...KGGGK...KGGKKCCKK',
    6: '..KGGGGGGGGSGGGGKDDK',
    8: '.KGGGGGKGGGGGGKGGKDK',
    9: 'KCCCCCCKCCKKCCKCCGGK',
    10: 'KCCCCCCKCCCCCCKCCCGK',
  },
}

const pixel = (raw, x, y) => {
  const i = (y * SIZE + x) * 4
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]]
}

const isWhite = ([r, g, b]) => r > 235 && g > 235 && b > 235

/** Everything reachable from the border over white is background. */
function backgroundMask(raw) {
  const mask = new Uint8Array(SIZE * SIZE)
  const queue = []
  const push = (x, y) => {
    const i = y * SIZE + x
    if (mask[i] || !isWhite(pixel(raw, x, y))) return
    mask[i] = 1
    queue.push(i)
  }
  for (let x = 0; x < SIZE; x += 1) {
    push(x, 0)
    push(x, SIZE - 1)
  }
  for (let y = 0; y < SIZE; y += 1) {
    push(0, y)
    push(SIZE - 1, y)
  }
  while (queue.length) {
    const i = queue.pop()
    const x = i % SIZE
    const y = (i - x) / SIZE
    if (x > 0) push(x - 1, y)
    if (x < SIZE - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < SIZE - 1) push(x, y + 1)
  }
  return mask
}

function nearestKey([r, g, b]) {
  let best = PALETTE[0]
  let bestDistance = Infinity
  for (const entry of PALETTE) {
    const [pr, pg, pb] = entry.rgb
    const distance = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = entry
    }
  }
  return best.key
}

function toGrid(raw) {
  const mask = backgroundMask(raw)
  const rows = []
  for (let gy = 0; gy < CELLS; gy += 1) {
    let row = ''
    for (let gx = 0; gx < CELLS; gx += 1) {
      const x = Math.min(SIZE - 1, Math.floor(CELL / 2 + CELL * gx))
      const y = Math.min(SIZE - 1, Math.floor(CELL / 2 + CELL * gy))
      row += mask[y * SIZE + x] ? '.' : nearestKey(pixel(raw, x, y))
    }
    rows.push(row)
  }
  return rows
}

function turn(rows, edits) {
  const out = [...rows]
  for (const [row, text] of Object.entries(edits)) {
    if (text.length !== CELLS) {
      throw new Error(`turn row ${row} is ${text.length} cells, expected ${CELLS}`)
    }
    out[Number(row)] = text
  }
  return out
}

function writeGrid(rows, path) {
  const buffer = Buffer.alloc(CELLS * CELLS * 4)
  rows.forEach((row, y) => {
    for (let x = 0; x < CELLS; x += 1) {
      const key = row[x]
      if (key === '.') continue
      const entry = PALETTE.find((candidate) => candidate.key === key)
      if (!entry) throw new Error(`unknown cell "${key}" in ${path}`)
      const i = (y * CELLS + x) * 4
      buffer[i] = entry.rgb[0]
      buffer[i + 1] = entry.rgb[1]
      buffer[i + 2] = entry.rgb[2]
      buffer[i + 3] = 255
    }
  })
  const temp = join(mkdtempSync(join(tmpdir(), 'fox-')), 'raw.rgba')
  writeFileSync(temp, buffer)
  execFileSync('magick', [
    '-size',
    `${CELLS}x${CELLS}`,
    '-depth',
    '8',
    `RGBA:${temp}`,
    '-strip',
    path,
  ])
  console.log(`wrote ${path}`)
}

function buildFox() {
  if (!existsSync(psd)) {
    console.warn(
      `skipped the fox: ${psd} is missing (restore it with\n` +
        `  git checkout $(git rev-list -1 --all -- assets/fox.psd) -- assets/fox.psd`,
    )
    return
  }
  const raw = execFileSync('magick', [psd, '-coalesce', '-depth', '8', 'rgba:-'], {
    maxBuffer: 64 * 1024 * 1024,
  })
  const frameSize = SIZE * SIZE * 4
  const frame = (index) => raw.subarray(index * frameSize, (index + 1) * frameSize)

  const outDir = join(root, 'src/assets/fox')
  mkdirSync(outDir, { recursive: true })
  const closed = toGrid(frame(2))
  const open = toGrid(frame(3))
  writeGrid(closed, join(outDir, 'closed.png'))
  writeGrid(open, join(outDir, 'open.png'))
  writeGrid(turn(closed, TURN.closed), join(outDir, 'closed-turn.png'))
  writeGrid(turn(open, TURN.open), join(outDir, 'open-turn.png'))
}

// --------------------------------------------------------------------- fig ---

/** Sized to the 76x89 artwork's aspect, small enough to stay chunky. */
const FIG_W = 14
const FIG_H = 16

function buildFig() {
  if (!existsSync(figSource)) {
    console.warn(`skipped the fig: ${figSource} is missing`)
    return
  }
  const outDir = join(root, 'src/assets/fig')
  mkdirSync(outDir, { recursive: true })
  const out = join(outDir, 'sprite.png')
  execFileSync('magick', [
    figSource,
    '-trim',
    '+repage',
    '-filter',
    'box',
    '-resize',
    `${FIG_W}x${FIG_H}`,
    '-strip',
    out,
  ])
  console.log(`wrote ${out}`)
}

buildFox()
buildFig()
