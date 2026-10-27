import { C, GAME } from './config'
import type { FoxGame } from './game'

export type ItemId = string

/** One navigable row, mirrored from the real elements in the page. */
export interface DockItem {
  id: ItemId
  label: string
  href?: string
}

export interface SceneItem {
  id: ItemId
  label: string
  href?: string
  /** Scene-space rect in CSS pixels. */
  x: number
  y: number
  w: number
  h: number
}

interface Layout {
  cssWidth: number
  cssHeight: number
  fontSize: number
  lineHeight: number
  margin: number
  contentWidth: number
  headerY: number
  bandTop: number
  bandHeight: number
  promptY: number
  gridY: number
  colWidth: number
  cols: number
  gridRows: number
  aboutPromptY: number
  aboutY: number
  aboutLines: number
  exitY: number
  statusY: number
}

export interface SceneState {
  time: number
  boot: number
  caught: number
  active: ItemId | null
  reducedMotion: boolean
  game: FoxGame
}

const POST_LINES = [
  { text: 'FIGFOX BIOS 0.31  /  Tokyo Night phosphor', color: C.green },
  { text: 'Copyright (C) 2026  cat0x1f.local', color: C.dim },
  { text: '', color: C.green },
  { text: 'CPU  fox.run                    ready', color: C.paper },
  { text: 'MEM  65536K OK', color: C.paper },
  { text: 'VGA  crt.phosphor              OK', color: C.cyan },
  { text: 'DSK  figs/                     OK', color: C.paper },
]

const MONO = '"JetBrains Mono", ui-monospace, monospace'

/** The shell prompt. Change this once and every line follows. */
const PROMPT = 'cat0x1f $ '

export class SceneRenderer {
  readonly canvas: HTMLCanvasElement

  private readonly ctx: CanvasRenderingContext2D
  private cssWidth = 1
  private cssHeight = 1
  private scale = 1
  private cached: Layout | null = null

  constructor(
    private readonly dock: DockItem[],
    private readonly about: string[] = [],
  ) {
    this.canvas = document.createElement('canvas')
    const ctx = this.canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D context is unavailable')
    this.ctx = ctx
  }

  resize(cssWidth: number, cssHeight: number, scale: number): void {
    this.cssWidth = Math.max(1, cssWidth)
    this.cssHeight = Math.max(1, cssHeight)
    this.scale = Math.max(0.5, scale)
    this.canvas.width = Math.round(this.cssWidth * this.scale)
    this.canvas.height = Math.round(this.cssHeight * this.scale)
    this.cached = null
  }

  get layout(): Layout {
    if (!this.cached) this.cached = this.computeLayout()
    return this.cached
  }

  /** Logical width the game should render at, so its grass line fits the band. */
  gameWidth(): number {
    const { bandHeight } = this.layout
    return Math.max(96, Math.round((GAME.height * this.cssWidth) / bandHeight))
  }

  draw(state: SceneState): SceneItem[] {
    const { ctx } = this
    const layout = this.layout

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight)
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const postFade = 1 - smooth((state.boot - 0.56) / 0.3)
    const contentFade = smooth((state.boot - 0.55) / 0.45)

    if (postFade > 0.01) this.drawPost(state, layout, postFade)
    if (contentFade <= 0.01) return []

    ctx.save()
    ctx.globalAlpha = contentFade
    this.drawHeader(state, layout)
    this.drawBand(state, layout)
    const items = this.drawListing(state, layout)
    this.drawAbout(layout)
    this.drawExit(layout)
    ctx.restore()

    return items
  }

  // ------------------------------------------------------------------ layout

  private computeLayout(): Layout {
    const w = this.cssWidth
    const h = this.cssHeight
    const fontSize = clamp(Math.min(w, h) * 0.022, 11, 16)
    const lineHeight = Math.round(fontSize * 1.7)
    const margin = Math.round(Math.min(w, h) * 0.055 + 10)
    const contentWidth = w - margin * 2

    const colWidth = clamp(contentWidth / 4, 128, 230)
    const cols = Math.max(1, Math.floor(contentWidth / colWidth))
    const gridRows = Math.max(1, Math.ceil(this.dock.length / cols))

    const headerY = Math.round(Math.max(h * 0.045, 12))
    const bandTop = Math.round(headerY + lineHeight * 1.5)
    const grassY = Math.max(bandTop + lineHeight * 3, Math.round(h * 0.55))
    const bandHeight = grassY - bandTop

    // Everything below the grass flows like shell output, and the three chunks
    // — `ls` + list, `cat` + bio, `exit` + status — are separated by one equal
    // gap, including the gap under the grass. Change the viewport and all three
    // grow or shrink together.
    const bottomPad = Math.max(h * 0.045, 14)
    const gridBlockH = lineHeight * 1.5 + gridRows * lineHeight * 1.06
    const exitBlockH = lineHeight * 1.35 + lineHeight
    const available = Math.max(0, h - bottomPad - grassY)

    let aboutLines = this.about.length
    const aboutBlock = (lines: number): number =>
      lines > 0 ? lineHeight * 1.4 + lines * lineHeight : 0

    let aboutBlockH = aboutBlock(aboutLines)
    let gap = (available - gridBlockH - aboutBlockH - exitBlockH) / 3
    const minGap = lineHeight * 0.5

    // Drop bio lines rather than let the spacing collapse on short screens.
    while (aboutLines > 0 && gap < minGap) {
      aboutLines -= 1
      aboutBlockH = aboutBlock(aboutLines)
      gap = (available - gridBlockH - aboutBlockH - exitBlockH) / 3
    }
    gap = Math.max(minGap, gap)

    const promptY = grassY + gap
    const gridY = promptY + lineHeight * 1.5
    const gridBottom = gridY + gridRows * lineHeight * 1.06
    const aboutPromptY = gridBottom + gap
    const aboutY = aboutPromptY + lineHeight * 1.4
    const aboutBottom = aboutLines > 0 ? aboutY + aboutLines * lineHeight : gridBottom
    const exitY = aboutBottom + gap
    const statusY = exitY + lineHeight * 1.35

    return {
      cssWidth: w,
      cssHeight: h,
      fontSize,
      lineHeight,
      margin,
      contentWidth,
      headerY,
      bandTop,
      bandHeight,
      promptY,
      gridY,
      colWidth,
      cols,
      gridRows,
      aboutPromptY,
      aboutY,
      aboutLines,
      exitY,
      statusY,
    }
  }

  // ------------------------------------------------------------------- parts

  private drawPost(state: SceneState, l: Layout, alpha: number): void {
    const { ctx } = this
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.font = `400 ${l.fontSize}px ${MONO}`
    const shown = Math.min(
      POST_LINES.length,
      Math.max(0, Math.floor((state.boot - 0.02) / 0.075) + 1),
    )
    let y = l.headerY + l.lineHeight * 0.5
    for (let i = 0; i < shown; i += 1) {
      const line = POST_LINES[i]
      if (!line) continue
      ctx.fillStyle = line.color
      ctx.fillText(line.text, l.margin, y)
      y += l.lineHeight
    }
    ctx.restore()
  }

  private drawHeader(state: SceneState, l: Layout): void {
    const { ctx } = this
    const y = l.headerY + l.lineHeight * 0.5
    ctx.font = `400 ${l.fontSize}px ${MONO}`

    const prefix = PROMPT
    ctx.fillStyle = C.dim
    ctx.fillText(prefix, l.margin, y)
    const prefixWidth = ctx.measureText(prefix).width

    ctx.fillStyle = C.green
    ctx.fillText('./fox', l.margin + prefixWidth, y)
    ctx.fillStyle = C.dim
    ctx.fillText(
      ' --auto',
      l.margin + prefixWidth + ctx.measureText('./fox').width,
      y,
    )

    const count = `${state.caught} fig${state.caught === 1 ? '' : 's'}`
    ctx.fillStyle = C.dim
    ctx.textAlign = 'right'
    ctx.fillText(`# ${count}`, l.margin + l.contentWidth, y)
    ctx.textAlign = 'left'
  }

  private drawBand(state: SceneState, l: Layout): void {
    const { ctx } = this
    state.game.resize(this.gameWidth())

    // A little depth behind the playfield so the sky is not a flat rectangle.
    const sky = ctx.createLinearGradient(
      0,
      l.bandTop,
      0,
      l.bandTop + l.bandHeight,
    )
    sky.addColorStop(0, C.bg)
    sky.addColorStop(1, '#131d28')
    ctx.fillStyle = sky
    ctx.fillRect(0, l.bandTop, l.cssWidth, l.bandHeight)

    ctx.imageSmoothingQuality = 'high'
    state.game.drawInto(ctx, {
      x: 0,
      y: l.bandTop,
      width: l.cssWidth,
      height: l.bandHeight,
    })
  }

  private drawListing(state: SceneState, l: Layout): SceneItem[] {
    const { ctx } = this
    ctx.font = `400 ${l.fontSize}px ${MONO}`

    const prompt = PROMPT
    const promptY = l.promptY + l.lineHeight * 0.5
    ctx.fillStyle = C.dim
    ctx.fillText(prompt, l.margin, promptY)
    ctx.fillStyle = C.green
    ctx.fillText('ls', l.margin + ctx.measureText(prompt).width, promptY)

    const rowHeight = l.lineHeight * 1.06
    const items: SceneItem[] = []
    const pad = l.fontSize * 0.4

    this.dock.forEach((cell, index) => {
      const row = Math.floor(index / l.cols)
      const col = index % l.cols
      const x = l.margin + col * l.colWidth
      const y = l.gridY + row * rowHeight
      const active = state.active === cell.id

      const labelWidth = ctx.measureText(cell.label).width
      const prefix = active ? '> ' : '  '
      const prefixWidth = ctx.measureText(prefix).width

      if (active) {
        ctx.fillStyle = 'rgba(0, 255, 65, 0.09)'
        ctx.fillRect(
          x - pad,
          y,
          labelWidth + prefixWidth + pad * 2,
          rowHeight,
        )
      }

      const mid = y + rowHeight * 0.5
      ctx.fillStyle = active ? C.hot : C.dim
      ctx.fillText(prefix, x, mid)
      ctx.fillStyle = active ? C.hot : C.green
      ctx.fillText(cell.label, x + prefixWidth, mid)

      items.push({
        id: cell.id,
        label: cell.label,
        href: cell.href,
        x: x - pad,
        y,
        w: labelWidth + prefixWidth + pad * 2,
        h: rowHeight,
      })
    })

    return items
  }

  private drawAbout(l: Layout): void {
    if (l.aboutLines <= 0) return
    const { ctx } = this
    ctx.font = `400 ${l.fontSize}px ${MONO}`

    const prompt = PROMPT
    const y = l.aboutPromptY + l.lineHeight * 0.5
    ctx.fillStyle = C.dim
    ctx.fillText(prompt, l.margin, y)
    ctx.fillStyle = C.green
    ctx.fillText('cat', l.margin + ctx.measureText(prompt).width, y)
    ctx.fillStyle = C.ink
    ctx.fillText(
      ' about.txt',
      l.margin + ctx.measureText(prompt).width + ctx.measureText('cat').width,
      y,
    )

    ctx.fillStyle = C.ink
    for (let i = 0; i < l.aboutLines; i += 1) {
      const line = this.about[i]
      if (!line) continue
      ctx.fillText(
        line,
        l.margin + l.fontSize * 1.2,
        l.aboutY + i * l.lineHeight + l.lineHeight * 0.5,
      )
    }
  }

  /** The session is over on purpose: nothing here takes input. */
  private drawExit(l: Layout): void {
    const { ctx } = this
    ctx.font = `400 ${l.fontSize}px ${MONO}`

    const exitMid = l.exitY + l.lineHeight * 0.5
    const prompt = PROMPT
    ctx.fillStyle = C.dim
    ctx.fillText(prompt, l.margin, exitMid)
    ctx.fillStyle = C.green
    ctx.fillText('exit', l.margin + ctx.measureText(prompt).width, exitMid)

    const small = Math.max(10, l.fontSize - 2)
    ctx.font = `400 ${small}px ${MONO}`
    ctx.fillStyle = C.dim
    ctx.fillText(
      '[ input disabled \u00b7 autoplay only ]',
      l.margin,
      l.statusY + l.lineHeight * 0.5,
    )

    // Version sits on the exit line, where there is always room for it.
    ctx.textAlign = 'right'
    ctx.globalAlpha *= 0.7
    ctx.fillText('1.0.0', l.margin + l.contentWidth, exitMid)
    ctx.globalAlpha /= 0.7
    ctx.textAlign = 'left'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
