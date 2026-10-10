import Konva from 'konva'
import type { Layer } from '@domain'
import { textLayout } from './nodeSpec'

/**
 * Rendered height of a text layer's content at its current width, font, size, line height and letter spacing: the
 * height Konva gives an auto-height Text node built from the same layout config the canvas draws with. Needs a DOM
 * canvas (renderer / built app); logic that uses it is tested with an injected measurer.
 */
export function measureTextHeight(layer: Extract<Layer, { type: 'text' }>): number {
  const node = new Konva.Text(textLayout(layer))
  try {
    return node.height()
  } finally {
    node.destroy()
  }
}
