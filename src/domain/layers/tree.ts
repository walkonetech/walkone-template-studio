import type { Layer } from './layers'

/**
 * Pure helpers over the flat layer list. Hierarchy is `parentId`; stacking is `zIndex` among
 * siblings. Ties (which a valid project never has) break by position in the array, so painting
 * order is always deterministic and never depends on rendering or insertion order.
 */

/** Siblings (same parent) sorted back-to-front: zIndex ascending, then array order. */
export function sortedSiblings(layers: readonly Layer[], parentId: string | undefined): Layer[] {
  return layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.parentId === parentId)
    .sort((a, b) => a.layer.zIndex - b.layer.zIndex || a.index - b.index)
    .map(({ layer }) => layer)
}

export const topLevelLayers = (layers: readonly Layer[]): Layer[] =>
  sortedSiblings(layers, undefined)

export const childrenOf = (layers: readonly Layer[], groupId: string): Layer[] =>
  sortedSiblings(layers, groupId)

/** Ids of every descendant (children, grandchildren, ...) of a layer. */
export function descendantIds(layers: readonly Layer[], id: string): string[] {
  const out: string[] = []
  const stack = [id]
  while (stack.length) {
    const current = stack.pop() as string
    for (const l of layers) {
      if (l.parentId === current) {
        out.push(l.id)
        stack.push(l.id)
      }
    }
  }
  return out
}

/** Ancestors from nearest parent outward. */
export function ancestorsOf(layers: readonly Layer[], id: string): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]))
  const out: Layer[] = []
  let cur = byId.get(id)?.parentId
  const guard = new Set<string>()
  while (cur !== undefined && !guard.has(cur)) {
    guard.add(cur)
    const parent = byId.get(cur)
    if (!parent) break
    out.push(parent)
    cur = parent.parentId
  }
  return out
}

/** The outermost group containing the layer, or the layer itself when it is top level. */
export function selectableRoot(layers: readonly Layer[], id: string): Layer | undefined {
  const own = layers.find((l) => l.id === id)
  if (!own) return undefined
  const chain = ancestorsOf(layers, id)
  return chain.length ? chain[chain.length - 1] : own
}

/** A layer can be edited unless it or any ancestor is locked. */
export function isEditable(layers: readonly Layer[], layer: Layer): boolean {
  return !layer.locked && !ancestorsOf(layers, layer.id).some((a) => a.locked)
}

/** Visible only if the layer and all ancestors are visible. */
export function isEffectivelyVisible(layers: readonly Layer[], layer: Layer): boolean {
  return layer.visible && !ancestorsOf(layers, layer.id).some((a) => !a.visible)
}
