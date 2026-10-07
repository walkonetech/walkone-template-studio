import { isEditable, isEffectivelyVisible, topmostIds, type Layer } from '@domain'

/**
 * The layers that currently carry transform handles: selected, topmost (a group and its own child are never both
 * transformed), editable (not locked directly or by an ancestor) and effectively visible. Used by both the canvas
 * (to attach the shared Transformer) and its commit handlers, so they always agree.
 */
export function transformTargets(
  layers: readonly Layer[],
  selectedIds: readonly string[]
): Layer[] {
  return topmostIds(layers, selectedIds)
    .map((id) => layers.find((l) => l.id === id))
    .filter(
      (l): l is Layer => l !== undefined && isEditable(layers, l) && isEffectivelyVisible(layers, l)
    )
}
