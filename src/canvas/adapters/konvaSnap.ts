import type Konva from 'konva'
import { snapToleranceDesign, type ViewTransform } from '../viewport/viewport'
import { computeSnap, type Guide, type Rect, type SnapResult } from '../snapping/snap'
import { computeResizeSnap, movingEdgesFor, type SizeMark } from '../snapping/resizeSnap'

export const DESIGN_NODE_ID = '__design'

const rectOf = (node: Konva.Node, relativeTo: Konva.Node): Rect => {
  const r = node.getClientRect({ relativeTo })
  return { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
}

/** Boxes (design space) of every visible, listening sibling layer node except `exclude` and the canvas itself. */
function otherRects(layer: Konva.Layer, exclude: ReadonlySet<Konva.Node>): Rect[] {
  const others: Rect[] = []
  for (const sibling of layer.getChildren()) {
    if (
      exclude.has(sibling) ||
      !sibling.id() ||
      sibling.id() === DESIGN_NODE_ID ||
      !sibling.visible()
    )
      continue
    others.push(rectOf(sibling, layer))
  }
  return others
}

/**
 * Snap result for the node being dragged, against the canvas and every other visible listening
 * sibling. Boxes are measured in DESIGN space (relative to the printable layer), and the tolerance is
 * converted from SCREEN pixels so it feels identical at every zoom.
 */
export function snapDraggedNode(
  node: Konva.Node,
  design: { width: number; height: number },
  view: ViewTransform,
  tolerancePx: number
): SnapResult | null {
  const layer = node.getLayer()
  if (!layer) return null
  return computeSnap(
    rectOf(node, layer),
    otherRects(layer, new Set([node])),
    design,
    snapToleranceDesign(tolerancePx, view)
  )
}

/** Konva.Transformer's box: absolute (stage) pixels, rotation in radians. */
export interface TransformerBox {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

const UNROTATED = 1e-6

/**
 * Snaps a Transformer resize (for `boundBoxFunc`): converts the proposed box into design space, snaps the edges the
 * active handle moves (see computeResizeSnap) and converts back. Rotated boxes, centred (Alt) scaling and the
 * rotate handle are left alone. Returns null when nothing applies.
 */
export function snapTransformerBox(
  tr: Konva.Transformer,
  box: TransformerBox,
  design: { width: number; height: number },
  view: ViewTransform,
  tolerancePx: number,
  centered: boolean
): { box: TransformerBox; guides: Guide[]; sizeMarks: SizeMark[] } | null {
  const nodes = tr.nodes()
  const layer = nodes[0]?.getLayer()
  const moving = movingEdgesFor(tr.getActiveAnchor())
  if (!layer || !moving || centered || Math.abs(box.rotation) > UNROTATED) return null
  const toDesign = layer.getAbsoluteTransform().copy().invert()
  const toAbs = layer.getAbsoluteTransform()
  const a = toDesign.point({ x: box.x, y: box.y })
  const b = toDesign.point({ x: box.x + box.width, y: box.y + box.height })
  const r = computeResizeSnap(
    { left: a.x, top: a.y, right: b.x, bottom: b.y },
    moving,
    tr.keepRatio(),
    otherRects(layer, new Set(nodes)),
    design,
    snapToleranceDesign(tolerancePx, view)
  )
  const p = toAbs.point({ x: r.box.left, y: r.box.top })
  const q = toAbs.point({ x: r.box.right, y: r.box.bottom })
  return {
    box: { x: p.x, y: p.y, width: q.x - p.x, height: q.y - p.y, rotation: box.rotation },
    guides: r.guides,
    sizeMarks: r.sizeMarks
  }
}
