import closedUrl from './assets/fox/closed.png'
import openUrl from './assets/fox/open.png'
import closedTurnUrl from './assets/fox/closed-turn.png'
import openTurnUrl from './assets/fox/open-turn.png'
import figUrl from './assets/fig/sprite.png'

/**
 * Everything the game draws, as PNGs produced by `node tools/build-sprites.mjs`.
 * No artwork lives in this file — only the loading.
 *
 * The fox comes in two expressions (eyes closed / open) and two facings
 * (towards the viewer / turned 3/4 towards the walk). The fig is a downscale of
 * src/assets/fig.png, the original drawing.
 */
export interface FoxArt {
  closed: HTMLImageElement
  open: HTMLImageElement
  closedTurn: HTMLImageElement
  openTurn: HTMLImageElement
}

export interface Art {
  fox: FoxArt
  fig: HTMLImageElement
}

/** Native pixel size of the fox grid. */
export const FOX_PIXELS = 20

export async function loadArt(): Promise<Art> {
  const [closed, open, closedTurn, openTurn, fig] = await Promise.all([
    loadImage(closedUrl),
    loadImage(openUrl),
    loadImage(closedTurnUrl),
    loadImage(openTurnUrl),
    loadImage(figUrl),
  ])
  return { fox: { closed, open, closedTurn, openTurn }, fig }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`could not load ${src}`))
    image.src = src
  })
}
