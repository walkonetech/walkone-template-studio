import type Konva from 'konva'
import { snapToleranceDesign, type ViewTransform } from '../viewport/viewport'
import { computeSnap, type Rect, type SnapResult } from '../snapping/snap'

export const DESIGN_NODE_ID = '__design'

const rectOf = (node: Konva.Node, relativeTo: Konva.Node): Rect => {
  const r = node.getClientRect({ relativeTo })
  return { left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height }
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
  const others: Rect[] = []
  for (const sibling of layer.getChildren()) {
    if (sibling === node || !sibling.id() || sibling.id() === DESIGN_NODE_ID || !sibling.visible())
      continue
    others.push(rectOf(sibling, layer))
  }
  return computeSnap(rectOf(node, layer), others, design, snapToleranceDesign(tolerancePx, view))
}
