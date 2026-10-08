import { getPixelSize, isEditable, topmostIds, type Layer, type TemplateProject } from '@domain'
import { boundsOf, moveLayerBy, type MutationContext } from './mutations'

/**
 * Selection-level geometry: exact position, align and distribute. All pure, all in DESIGN coordinates, all returning
 * ONE new project (so the store records one history entry). Rules shared by every operation:
 *  - only the TOPMOST selected layers are processed (a group and its own child are never both moved),
 *  - locked layers (directly or through an ancestor) are skipped,
 *  - moving is translation only (`moveLayerBy`), so sizes, rotations and group-relative geometry never change,
 *  - bounds are the rotation-aware axis-aligned box of each layer (what the canvas shows).
 */

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'
export type AlignTarget = 'selection' | 'canvas'

export function layerBounds(layer: Layer): Bounds {
  const b = boundsOf(layer)
  return { x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top }
}

/** The editable topmost layers of a selection, in selection order. */
export function arrangeTargets(project: TemplateProject, ids: readonly string[]): Layer[] {
  return topmostIds(project.layers, ids)
    .map((id) => project.layers.find((l) => l.id === id))
    .filter((l): l is Layer => l !== undefined && isEditable(project.layers, l))
}

/** Union bounds of layers, or null for none. */
export function unionBounds(layers: readonly Layer[]): Bounds | null {
  if (layers.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const l of layers) {
    const b = layerBounds(l)
    left = Math.min(left, b.x)
    top = Math.min(top, b.y)
    right = Math.max(right, b.x + b.width)
    bottom = Math.max(bottom, b.y + b.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Bounds of the movable part of a selection (what the inspector shows for a multi-selection or group). */
export function selectionBounds(project: TemplateProject, ids: readonly string[]): Bounds | null {
  return unionBounds(arrangeTargets(project, ids))
}

const translate = (
  project: TemplateProject,
  moves: readonly { id: string; dx: number; dy: number }[],
  ctx: MutationContext
): TemplateProject => {
  let next = project
  for (const m of moves) {
    if (m.dx === 0 && m.dy === 0) continue
    next = moveLayerBy(next, m.id, m.dx, m.dy, ctx)
  }
  return next
}

/**
 * Moves the selection so its bounds' top-left is at the given X and/or Y, keeping every relative offset. A group
 * moves as a whole (its children are translated; its own box is re-derived from them, never stored separately).
 */
export function moveSelectionTo(
  project: TemplateProject,
  ids: readonly string[],
  to: { x?: number; y?: number },
  ctx: MutationContext = {}
): TemplateProject {
  const targets = arrangeTargets(project, ids)
  const b = unionBounds(targets)
  if (!b) return project
  const dx = to.x === undefined ? 0 : to.x - b.x
  const dy = to.y === undefined ? 0 : to.y - b.y
  return translate(
    project,
    targets.map((l) => ({ id: l.id, dx, dy })),
    ctx
  )
}

/**
 * Aligns layers to the selection's union bounds, or to the canvas. With 'selection' at least two layers are needed
 * (a single layer is already aligned with itself); callers use 'canvas' for one layer.
 */
export function alignLayers(
  project: TemplateProject,
  ids: readonly string[],
  mode: AlignMode,
  target: AlignTarget,
  ctx: MutationContext = {}
): TemplateProject {
  const targets = arrangeTargets(project, ids)
  if (targets.length === 0 || (target === 'selection' && targets.length < 2)) return project
  const frame: Bounds =
    target === 'canvas'
      ? { x: 0, y: 0, ...getPixelSize(project.canvas.print) }
      : (unionBounds(targets) as Bounds)
  const moves = targets.map((l) => {
    const b = layerBounds(l)
    switch (mode) {
      case 'left':
        return { id: l.id, dx: frame.x - b.x, dy: 0 }
      case 'hcenter':
        return { id: l.id, dx: frame.x + frame.width / 2 - (b.x + b.width / 2), dy: 0 }
      case 'right':
        return { id: l.id, dx: frame.x + frame.width - (b.x + b.width), dy: 0 }
      case 'top':
        return { id: l.id, dx: 0, dy: frame.y - b.y }
      case 'vcenter':
        return { id: l.id, dx: 0, dy: frame.y + frame.height / 2 - (b.y + b.height / 2) }
      case 'bottom':
        return { id: l.id, dx: 0, dy: frame.y + frame.height - (b.y + b.height) }
    }
  })
  return translate(project, moves, ctx)
}

/** Distribution needs at least three movable layers. */
export const MIN_DISTRIBUTE = 3

/**
 * Equalizes the gaps between layers along an axis. Layers are ordered by their near edge; the first stays at the
 * start of the span and the span's far edge is preserved, so the outer items keep their positions and only the
 * ones between move. Gaps may be negative (overlapping layers stay overlapping by the same amount).
 */
export function distributeLayers(
  project: TemplateProject,
  ids: readonly string[],
  axis: DistributeAxis,
  ctx: MutationContext = {}
): TemplateProject {
  const targets = arrangeTargets(project, ids)
  if (targets.length < MIN_DISTRIBUTE) return project
  const horizontal = axis === 'horizontal'
  const items = targets
    .map((l, index) => ({ l, index, b: layerBounds(l) }))
    .map((i) => ({
      ...i,
      start: horizontal ? i.b.x : i.b.y,
      size: horizontal ? i.b.width : i.b.height
    }))
    .sort((a, b) => a.start - b.start || a.index - b.index)
  const first = items[0]?.start as number
  const end = Math.max(...items.map((i) => i.start + i.size))
  const gap = (end - first - items.reduce((sum, i) => sum + i.size, 0)) / (items.length - 1)
  let cursor = first
  const moves = items.map((i) => {
    const delta = cursor - i.start
    cursor += i.size + gap
    return { id: i.l.id, dx: horizontal ? delta : 0, dy: horizontal ? 0 : delta }
  })
  return translate(project, moves, ctx)
}
