import type Konva from 'konva'

/**
 * Development/validation hooks. `window.__wts` exists only when the page URL hash contains "debug"; it
 * exposes in-renderer objects only (no new privileges) so scripted validation can find canvas handles and
 * read state. Not used by the product.
 */
export interface CanvasDebugTargets {
  stage: Konva.Stage | null
  transformer: Konva.Transformer | null
}

let provider: (() => CanvasDebugTargets) | null = null

export function registerCanvasDebug(p: () => CanvasDebugTargets): () => void {
  provider = p
  return () => {
    if (provider === p) provider = null
  }
}

export const canvasTargets = (): CanvasDebugTargets =>
  provider?.() ?? { stage: null, transformer: null }

export interface DebugApi {
  store: unknown
  imageCache: unknown
  /** Design Guide state (7C) and UI layout state, for the built-app suites. */
  guide?: unknown
  layout?: unknown
  /** Renders the current project offscreen at an exact size and reports what came out. */
  renderToDataUrl: (
    width?: number,
    height?: number
  ) => Promise<{ width: number; height: number; dataUrl: string; ms: number }>
  /** Renders the PRINT SHEET (output composition: every copy, clipped to its cell) at an exact size. */
  renderSheetToDataUrl: (
    width?: number,
    height?: number
  ) => Promise<{ width: number; height: number; dataUrl: string; ms: number }>
  /** Client coordinates of a transformer handle ('top-left', 'rotater', …) or null. */
  handlePoint: (name: string) => { x: number; y: number } | null
  /** Client coordinates of a layer node's center. */
  layerCenter: (id: string) => { x: number; y: number } | null
  canvasCount: () => number
  /** How many nodes with this Konva name the visible stage holds (e.g. 'cut-guide', 'margin-box', 'safe-line'). */
  countNodes: (name: string) => number
  /** The font-family string the canvas node of a text layer actually draws with (requested family + fallback stack). */
  textFont: (layerId: string) => string | null
  /** The editor stage as the user sees it (workspace pixels) plus its view transform, for pixel checks. */
  stageSnapshot: () => {
    dataUrl: string
    width: number
    height: number
    scale: number
    x: number
    y: number
  } | null
}

declare global {
  interface Window {
    __wts?: DebugApi
  }
}

export function installDebug(
  api: Omit<
    DebugApi,
    'handlePoint' | 'layerCenter' | 'canvasCount' | 'countNodes' | 'stageSnapshot' | 'textFont'
  >
): void {
  if (!window.location.hash.includes('debug')) return
  window.__wts = {
    ...api,
    handlePoint: (name) => {
      const { stage, transformer } = canvasTargets()
      if (!transformer || transformer.nodes().length === 0) return null
      const anchor = transformer.findOne(`.${name}`)
      if (!stage || !anchor) return null
      const p = anchor.getAbsolutePosition()
      const r = stage.container().getBoundingClientRect()
      return { x: r.left + p.x, y: r.top + p.y }
    },
    layerCenter: (id) => {
      const { stage } = canvasTargets()
      const node = stage?.findOne((n: Konva.Node) => n.id() === id)
      if (!stage || !node) return null
      const c = node.getClientRect()
      const r = stage.container().getBoundingClientRect()
      return { x: r.left + c.x + c.width / 2, y: r.top + c.y + c.height / 2 }
    },
    canvasCount: () => document.querySelectorAll('canvas').length,
    countNodes: (name) => canvasTargets().stage?.find(`.${name}`).length ?? 0,
    textFont: (id) => {
      const node = canvasTargets().stage?.findOne((n: Konva.Node) => n.id() === id)
      return node && 'fontFamily' in node ? String((node as Konva.Text).fontFamily()) : null
    },
    stageSnapshot: () => {
      const { stage } = canvasTargets()
      if (!stage) return null
      return {
        dataUrl: stage.toDataURL({ pixelRatio: 1 }),
        width: stage.width(),
        height: stage.height(),
        scale: stage.scaleX(),
        x: stage.x(),
        y: stage.y()
      }
    }
  }
}
