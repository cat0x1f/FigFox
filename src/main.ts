import { RUNNER } from './config'
import { FoxGame } from './game'
import { loadArt } from './art'
import { FoxRunner } from './runner'
import { SceneRenderer, type DockItem, type ItemId, type PlayMode, type SceneItem } from './scene'
import { screenToScene, type CrtRenderer } from './crt'
import { createWebGLRenderer } from './crt/gl'
import { createCanvasRenderer } from './crt/canvas2d'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const canvas = document.querySelector<HTMLCanvasElement>('#crt')
const dockEl = document.querySelector<HTMLElement>('#dock')

/** How long a hold has to last before the easter egg opens. */
const HOLD_SECONDS = 3
/** Two fingers must stay within this many pixels to count as a hold. */
const HOLD_SLOP = 14

if (canvas && dockEl) {
  boot(canvas, dockEl).catch((error: unknown) => {
    console.error(error)
  })
}

async function boot(
  crtCanvas: HTMLCanvasElement,
  dock: HTMLElement,
): Promise<void> {
  const picked: CrtRenderer | null =
    createWebGLRenderer(crtCanvas) ?? createCanvasRenderer(crtCanvas)
  if (!picked) return
  const renderer: CrtRenderer = picked
  if (renderer.kind === 'canvas2d') {
    document.documentElement.classList.add('is-flat')
  }

  const elements = new Map<ItemId, HTMLElement>()
  const items: DockItem[] = [...dock.querySelectorAll<HTMLElement>('[data-item]')].map(
    (element) => {
      const id = element.dataset.item ?? ''
      elements.set(id, element)
      return {
        id,
        label: (element.textContent ?? id).trim(),
        href: element.getAttribute('href') ?? undefined,
      }
    },
  )

  const about = [...document.querySelectorAll('#about p')]
    .map((element) => (element.textContent ?? '').trim())
    .filter(Boolean)

  const art = await loadArt()
  const game = new FoxGame(256, { reducedMotion, art })
  const runner = new FoxRunner(256, { art, reducedMotion })
  const scene = new SceneRenderer(items, about)

  let mode: PlayMode = 'idle'
  let hold = 0
  let spaceDown = false
  let spaceSince = 0
  let touchSince = 0
  const touchOrigin = new Map<number, { x: number; y: number }>()

  let hoverId: ItemId | null = null
  let focusId: ItemId | null = null
  let lastInput: 'mouse' | 'key' = 'mouse'
  let activePointer: number | null = null
  let downItem: SceneItem | null = null
  let downX = 0
  let downY = 0
  let drawn: SceneItem[] = []
  let cssWidth = 1
  let cssHeight = 1
  let started = performance.now()

  // -------------------------------------------------------------- sizing ---

  function applySize(): void {
    cssWidth = Math.max(1, window.innerWidth)
    cssHeight = Math.max(1, window.innerHeight)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.resize(cssWidth, cssHeight, dpr)
    const scale = clamp(
      Math.min(dpr, 2560 / cssWidth, 1600 / cssHeight),
      0.6,
      2,
    )
    scene.resize(cssWidth, cssHeight, scale)
    // Size the play field before the first fig can be placed.
    game.resize(scene.gameWidth())
    runner.resize(scene.gameWidth())
  }

  applySize()
  window.addEventListener('resize', applySize)
  window.addEventListener('orientationchange', applySize)

  // ---------------------------------------------------------------- modes ---

  function enterRunner(): void {
    if (mode === 'runner') return
    mode = 'runner'
    hold = 0
    game.setGlow(0)
    game.stop()
    // The fox runs into position from wherever the screensaver left it.
    runner.enter(game.position)
    runner.start()
    lastInput = 'key'
    hoverId = null
    focusId = null
    crtCanvas.classList.remove('is-hot')
  }

  /** Ask the fox to run back out; it is actually idle once the run finishes. */
  function requestLeave(): void {
    if (mode !== 'runner') return
    runner.leave(game.position)
  }

  function finishLeave(): void {
    mode = 'idle'
    runner.stop()
    game.start()
    spaceDown = false
    hold = 0
    touchOrigin.clear()
    touchSince = 0
  }

  /** Space or a tap: jump, or start over once the fox has crashed. */
  function tapAction(): void {
    if (mode !== 'runner') return
    if (runner.currentPhase === 'over') runner.restart()
    else if (runner.currentPhase === 'running') runner.jump()
  }

  // ------------------------------------------------------------- pointing ---

  function hitTest(clientX: number, clientY: number): SceneItem | null {
    const point = screenToScene(
      clientX,
      clientY,
      crtCanvas.getBoundingClientRect(),
      renderer.zoom,
      cssWidth,
      cssHeight,
    )
    if (!point) return null
    for (const item of drawn) {
      if (
        point.x >= item.x &&
        point.x <= item.x + item.w &&
        point.y >= item.y &&
        point.y <= item.y + item.h
      ) {
        return item
      }
    }
    return null
  }

  function insideBand(clientY: number): boolean {
    const point = screenToScene(
      cssWidth / 2,
      clientY,
      crtCanvas.getBoundingClientRect(),
      renderer.zoom,
      cssWidth,
      cssHeight,
    )
    if (!point) return false
    const band = scene.layout
    return point.y >= band.bandTop && point.y <= band.bandTop + band.bandHeight
  }

  function activate(item: SceneItem): void {
    // Go through the real element so link behaviour stays browser-native.
    const element = elements.get(item.id)
    if (element) {
      element.click()
      return
    }
    if (item.href) window.location.href = item.href
  }

  crtCanvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    activePointer = event.pointerId
    crtCanvas.setPointerCapture(event.pointerId)
    downX = event.clientX
    downY = event.clientY

    if (mode === 'runner' && insideBand(event.clientY)) {
      tapAction()
      return
    }

    touchOrigin.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (touchOrigin.size === 2) touchSince = performance.now()
    downItem = hitTest(event.clientX, event.clientY)
  })

  crtCanvas.addEventListener('pointermove', (event) => {
    const origin = touchOrigin.get(event.pointerId)
    if (origin) {
      const drift = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      if (drift > HOLD_SLOP) {
        touchOrigin.delete(event.pointerId)
        touchSince = 0
      }
    }

    if (activePointer !== null) return
    if (event.pointerType !== 'mouse') return
    if (mode === 'runner' && insideBand(event.clientY)) return
    const hit = hitTest(event.clientX, event.clientY)
    lastInput = 'mouse'
    hoverId = hit?.id ?? null
    crtCanvas.classList.toggle('is-hot', Boolean(hit))
  })

  const release = (event: PointerEvent): void => {
    touchOrigin.delete(event.pointerId)
    if (touchOrigin.size < 2) touchSince = 0

    if (activePointer !== event.pointerId) return
    activePointer = null
    if (crtCanvas.hasPointerCapture(event.pointerId)) {
      crtCanvas.releasePointerCapture(event.pointerId)
    }

    if (downItem) {
      const moved = Math.hypot(event.clientX - downX, event.clientY - downY)
      const hit = hitTest(event.clientX, event.clientY)
      if (moved < 9 && hit && hit.id === downItem.id) activate(hit)
    }
    downItem = null
  }

  crtCanvas.addEventListener('pointerup', release)
  crtCanvas.addEventListener('pointercancel', release)
  crtCanvas.addEventListener('pointerleave', () => {
    if (activePointer === null) {
      hoverId = null
      crtCanvas.classList.remove('is-hot')
    }
  })

  // -------------------------------------------------------------- keyboard ---

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (event.key === 'Escape' && mode === 'runner') {
      event.preventDefault()
      requestLeave()
      return
    }

    if (event.code !== 'Space') return
    event.preventDefault()
    if (event.repeat) return

    if (mode === 'runner') {
      tapAction()
      return
    }
    spaceDown = true
    spaceSince = performance.now()
  })

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') return
    spaceDown = false
    hold = 0
    game.setGlow(0)
  })

  window.addEventListener('blur', () => {
    spaceDown = false
    hold = 0
    game.setGlow(0)
    touchOrigin.clear()
    touchSince = 0
  })

  dock.addEventListener('focusin', (event) => {
    const id = (event.target as HTMLElement | null)?.dataset.item ?? null
    if (!id) return
    focusId = id
    lastInput = 'key'
  })

  dock.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!dock.contains(document.activeElement)) focusId = null
    }, 0)
  })

  // ----------------------------------------------------------------- loop ---

  function updateHold(now: number): void {
    if (mode === 'runner') {
      hold = 0
      return
    }

    let progress = 0
    if (spaceDown) {
      progress = (now - spaceSince) / 1000 / HOLD_SECONDS
    } else if (touchSince > 0 && touchOrigin.size >= 2) {
      progress = (now - touchSince) / 1000 / HOLD_SECONDS
    }

    hold = clamp(progress, 0, 1)
    game.setGlow(hold)
    if (hold >= 1) enterRunner()
  }

  function frame(now: number): void {
    const time = (now - started) / 1000
    const boot = reducedMotion ? 10 : time
    const active = mode === 'idle' && lastInput === 'key' ? focusId : hoverId

    updateHold(now)
    if (mode === 'runner') {
      if (runner.exited) {
        finishLeave()
      } else if (
        runner.currentPhase === 'over' &&
        runner.finishedFor > RUNNER.overHold
      ) {
        requestLeave()
      }
    }

    drawn = scene.draw({
      time,
      boot,
      caught: game.caught,
      active,
      reducedMotion,
      game,
      runner,
      mode,
      hold,
    })

    const lit = active ? drawn.find((item) => item.id === active) : null
    renderer.draw(scene.canvas, {
      power:
        reducedMotion || boot > 0.55
          ? 1
          : boot < 0.06
            ? 0.18
            : boot < 0.18
              ? 1.55
              : 1 + 0.55 * (1 - (boot - 0.18) / 0.34),
      roll: reducedMotion || boot > 0.55 ? 0 : 1 - boot / 0.55,
      time,
      hover: lit
        ? {
            x: lit.x / cssWidth,
            y: lit.y / cssHeight,
            w: lit.w / cssWidth,
            h: lit.h / cssHeight,
          }
        : null,
    })

    requestAnimationFrame(frame)
  }

  // ------------------------------------------------------------- start up ---

  dock.classList.add('is-live')

  await document.fonts
    .load('400 16px "JetBrains Mono"')
    .catch(() => undefined)

  applySize()
  started = performance.now()
  game.start()
  requestAnimationFrame(frame)

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__figfox = {
      game,
      runner,
      scene,
      renderer,
      items: () => drawn,
      layout: () => scene.layout,
      size: () => ({ cssWidth, cssHeight }),
      mode: () => mode,
      hold: () => hold,
      enterRunner,
      requestLeave,
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
