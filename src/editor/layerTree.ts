import { ancestorsOf, sortedSiblings, type Layer } from '@domain'

/**
 * Presentation order for the Layers Panel. Convention: TOP of the panel = FRONT of the artwork. Within each
 * sibling set the panel shows the REVERSE of the canvas paint order (`sortedSiblings`: zIndex ascending, then
 * array order), so panel and canvas always agree. Groups show their children directly beneath them, indented.
 * Persisted zIndex is never changed for presentation.
 */

export interface PanelRow {
  layer: Layer
  depth: number
  hasChildren: boolean
  collapsed: boolean
  /** Layer's own flags. */
  directLocked: boolean
  directVisible: boolean
  /** True when an ancestor group, not the layer itself, makes it locked / hidden. */
  lockedByAncestor: boolean
  hiddenByAncestor: boolean
  /** What actually applies on the canvas. */
  effectivelyLocked: boolean
  effectivelyVisible: boolean
}

export interface PanelOptions {
  collapsed?: ReadonlySet<string>
  /** Case-insensitive name filter; matching rows keep their ancestors visible. */
  filter?: string
}

export function buildPanelRows(layers: readonly Layer[], options: PanelOptions = {}): PanelRow[] {
  const collapsed = options.collapsed ?? new Set<string>()
  const needle = options.filter?.trim().toLowerCase() ?? ''
  const rows: PanelRow[] = []

  const matches = new Set<string>()
  if (needle) {
    for (const l of layers) {
      if (l.name.toLowerCase().includes(needle)) {
        matches.add(l.id)
        for (const a of ancestorsOf(layers, l.id)) matches.add(a.id)
      }
    }
  }

  const walk = (
    parentId: string | undefined,
    depth: number,
    lockedAbove: boolean,
    hiddenAbove: boolean
  ): void => {
    const siblings = [...sortedSiblings(layers, parentId)].reverse() // front first
    for (const layer of siblings) {
      if (needle && !matches.has(layer.id)) continue
      const kids = layer.type === 'group' ? sortedSiblings(layers, layer.id) : []
      const isCollapsed = collapsed.has(layer.id) && !needle
      rows.push({
        layer,
        depth,
        hasChildren: kids.length > 0,
        collapsed: isCollapsed,
        directLocked: layer.locked,
        directVisible: layer.visible,
        lockedByAncestor: lockedAbove,
        hiddenByAncestor: hiddenAbove,
        effectivelyLocked: layer.locked || lockedAbove,
        effectivelyVisible: layer.visible && !hiddenAbove
      })
      if (kids.length > 0 && !isCollapsed) {
        walk(layer.id, depth + 1, lockedAbove || layer.locked, hiddenAbove || !layer.visible)
      }
    }
  }
  walk(undefined, 0, false, false)
  return rows
}

/** Short type label used next to (and instead of relying on) the type icon. */
export function layerTypeLabel(layer: Layer): string {
  switch (layer.type) {
    case 'photo':
      return 'Photo'
    case 'image':
      return layer.role === 'graphic' ? 'Image' : `Image · ${layer.role}`
    case 'text':
      return 'Text'
    case 'shape':
      return layer.shape === 'rectangle'
        ? 'Rectangle'
        : layer.shape === 'ellipse'
          ? 'Ellipse'
          : 'Line'
    case 'group':
      return 'Group'
  }
}
