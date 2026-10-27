import { FoxGame } from './game'
import { loadArt } from './art'
import { SceneRenderer, type DockItem, type ItemId, type SceneItem } from './scene'
import { screenToScene, type CrtRenderer } from './crt'
import { createWebGLRenderer } from './crt/gl'
import { createCanvasRenderer } from './crt/canvas2d'

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const canvas = document.querySelector<HTMLCanvasElement>('#crt')
const dockEl = document.querySelector<HTMLElement>('#dock')

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
  const scene = new SceneRenderer(items, about)

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
  }

  applySize()
  window.addEventListener('resize', applySize)
  window.addEventListener('orientationchange', applySize)

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
    downItem = hitTest(event.clientX, event.clientY)
  })

  crtCanvas.addEventListener('pointermove', (event) => {
    if (activePointer !== null) return
    if (event.pointerType !== 'mouse') return
    const hit = hitTest(event.clientX, event.clientY)
    lastInput = 'mouse'
    hoverId = hit?.id ?? null
    crtCanvas.classList.toggle('is-hot', Boolean(hit))
  })

  const release = (event: PointerEvent): void => {
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

  dock.addEventListener('focusin', (event) => {
    const id = (event.target as HTMLElement | null)?.dataset.item ?? null
    if (!id) return
    focusId = id
    lastInput = 'key'
  })

  dock.addEventListener('focusout', () => {
    // Keep the highlight until focus lands somewhere else outside the dock.
    window.setTimeout(() => {
      if (!dock.contains(document.activeElement)) focusId = null
    }, 0)
  })

  // ----------------------------------------------------------------- loop ---

  function frame(now: number): void {
    const time = (now - started) / 1000
    const boot = reducedMotion ? 10 : time
    const active = lastInput === 'key' ? focusId : hoverId

    drawn = scene.draw({
      time,
      boot,
      caught: game.caught,
      active,
      reducedMotion,
      game,
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
      scene,
      renderer,
      items: () => drawn,
      layout: () => scene.layout,
      size: () => ({ cssWidth, cssHeight }),
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
