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
  /** Renders the current project offscreen at an exact size and reports what came out. */
  renderToDataUrl: (
    width?: number,
    height?: number
  ) => Promise<{ width: number; height: number; dataUrl: string; ms: number }>
  /** Client coordinates of a transformer handle ('top-left', 'rotater', …) or null. */
  handlePoint: (name: string) => { x: number; y: number } | null
  /** Client coordinates of a layer node's center. */
  layerCenter: (id: string) => { x: number; y: number } | null
  canvasCount: () => number
}

declare global {
  interface Window {
    __wts?: DebugApi
  }
}

export function installDebug(
  api: Omit<DebugApi, 'handlePoint' | 'layerCenter' | 'canvasCount'>
): void {
  if (!window.location.hash.includes('debug')) return
  window.__wts = {
    ...api,
    handlePoint: (name) => {
      const { stage, transformer } = canvasTargets()
      const anchor = transformer?.findOne(`.${name}`)
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
    canvasCount: () => document.querySelectorAll('canvas').length
  }
}
