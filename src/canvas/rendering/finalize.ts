import type Konva from 'konva'
import type { Layer } from '@domain'

/** Konva measures text height itself: re-center the node's origin on the measured box (editor and offscreen render share this). */
export function finalizeTextNode(node: Konva.Node, layer: Layer): void {
  if (layer.type !== 'text') return
  node.offsetY(node.height() / 2)
  node.y(layer.y + node.height() / 2)
}
