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

/**
 * Where a text layer's drawn lines sit inside its box (unrotated, relative to the layer's x/y), from the same Konva
 * layout the canvas draws with: the widest line's horizontal extent for the alignment, and the lines that fit the box
 * height. Used by the safe-area check so a wide box holding short centred text is judged by its text. Null when the
 * layer draws nothing (empty text). Needs a DOM canvas.
 */
export function measureTextInk(
  layer: Extract<Layer, { type: 'text' }>
): { x: number; y: number; width: number; height: number } | null {
  const node = new Konva.Text({ ...textLayout(layer), height: layer.height })
  try {
    const lines = node.textArr.filter((l) => l.text.trim() !== '')
    if (lines.length === 0) return null
    let left = Infinity
    let right = -Infinity
    for (const l of node.textArr) {
      if (l.text.trim() === '') continue
      const w = Math.min(l.width, layer.width)
      const x =
        layer.align === 'center'
          ? (layer.width - w) / 2
          : layer.align === 'right'
            ? layer.width - w
            : 0
      left = Math.min(left, x)
      right = Math.max(right, x + w)
    }
    const height = Math.min(layer.height, node.textArr.length * layer.fontSize * layer.lineHeight)
    return { x: left, y: 0, width: right - left, height }
  } finally {
    node.destroy()
  }
}
