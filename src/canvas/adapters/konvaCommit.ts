import type Konva from 'konva'
import type { Layer } from '@domain'
import { invert, multiply, type Matrix } from '../geometry/geometry'
import {
  normalizeFromMatrix,
  normalizeNodeTransform,
  normalizeTextTransform,
  type NodeTransform
} from '../transforms/normalize'
import type { GeometryChange } from '../../editor/mutations'

/**
 * Reads finished Konva interactions back into plain domain geometry. This is the ONLY place where
 * Konva node state is translated into domain values; the results contain no scale factors.
 * Only types are imported from Konva, so the numeric logic stays unit-testable.
 */

const toMatrix = (m: number[]): Matrix => [
  m[0] ?? 1,
  m[1] ?? 0,
  m[2] ?? 0,
  m[3] ?? 1,
  m[4] ?? 0,
  m[5] ?? 0
]

/** Local (unscaled) box of a node: ellipses are 2×radius; others use their width/height. */
function localSize(node: Konva.Node, layer: Layer): { width: number; height: number } {
  if (node.getClassName() === 'Ellipse') {
    const e = node as Konva.Ellipse
    return { width: e.radiusX() * 2, height: e.radiusY() * 2 }
  }
  if (layer.type === 'text') return { width: node.width(), height: node.height() }
  // Lines have no width/height of their own; the domain box is the local box.
  return { width: node.width() || layer.width, height: node.height() || layer.height }
}

export function readNodeTransform(node: Konva.Node, layer: Layer): NodeTransform {
  const size = localSize(node, layer)
  return {
    x: node.x(),
    y: node.y(),
    width: size.width,
    height: size.height,
    scaleX: node.scaleX(),
    scaleY: node.scaleY(),
    rotation: node.rotation()
  }
}

/** Konva keeps scale on the node after a resize; the domain value now carries it, so reset to 1. */
export function resetNodeScale(node: Konva.Node): void {
  node.scale({ x: 1, y: 1 })
}

/** Geometry change for a top-level node after a drag or transform (scale folded in, then reset). */
export function commitTopLevelNode(node: Konva.Node, layer: Layer): GeometryChange {
  const t = readNodeTransform(node, layer)
  const change: GeometryChange =
    layer.type === 'text'
      ? (() => {
          const r = normalizeTextTransform(t, layer.fontSize)
          return { id: layer.id, geometry: r.geometry, fontSize: r.fontSize }
        })()
      : { id: layer.id, geometry: normalizeNodeTransform(t) }
  resetNodeScale(node)
  return change
}

/**
 * Geometry changes for every child of a runtime group after the group was moved/rotated/scaled.
 * Children hold ABSOLUTE design coordinates in the domain, so each child's world matrix is taken
 * relative to the stage's view transform. The runtime group is then reset to identity.
 */
export function commitGroupNode(group: Konva.Group, layers: readonly Layer[]): GeometryChange[] {
  const stage = group.getStage()
  const view = stage
    ? toMatrix(stage.getAbsoluteTransform().getMatrix())
    : toMatrix([1, 0, 0, 1, 0, 0])
  const inverseView = invert(view)
  const changes: GeometryChange[] = []
  const walk = (container: Konva.Container): void => {
    for (const child of container.getChildren()) {
      const layer = layers.find((l) => l.id === child.id())
      if (!layer) continue
      if (layer.type === 'group') {
        walk(child as Konva.Container)
        continue
      }
      const size = localSize(child, layer)
      const design = multiply(inverseView, toMatrix(child.getAbsoluteTransform().getMatrix()))
      // Ellipse local origin is its center; every other node's local origin is its top-left corner.
      const origin = child.getClassName() === 'Ellipse' ? 'center' : 'top-left'
      let change: GeometryChange
      if (layer.type === 'text') {
        const scaleY = Math.hypot(design[2], design[3]) / 1
        const geometry = normalizeFromMatrix(design, size.width, size.height, origin)
        change = {
          id: layer.id,
          geometry,
          fontSize: Math.round(layer.fontSize * scaleY * 1000) / 1000
        }
      } else {
        change = {
          id: layer.id,
          geometry: normalizeFromMatrix(design, size.width, size.height, origin)
        }
      }
      changes.push(change)
    }
  }
  walk(group)
  group.position({ x: 0, y: 0 })
  group.rotation(0)
  group.scale({ x: 1, y: 1 })
  return changes
}
