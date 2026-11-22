import { isEditable, type ColorValue, type Layer, type TemplateProject } from '@domain'
import { placeFloating, type Rect } from './floatingPlacement'
import type { Bounds } from './arrange'

/**
 * The contextual selection toolbar (Phase 7B B5, B1 mockups 03/04, §0a amendment): a light row of 3–5 frequent actions
 * in words, floating over the canvas next to the selection. Pure rules only: which actions a selection gets, when the
 * toolbar shows, and where it goes. Every action calls an existing store command (Duplicate, stacking, align, group),
 * so the toolbar adds no new editing behaviour, no schema and no geometry of its own.
 *
 * Sets (B1 + the B3.1 Sample Photos removal, ADR-056):
 *  - Text: Edit text · Event Palette colours · Arrange · Duplicate · More
 *  - Photo slot: Photo number · Frame · Arrange · Duplicate · More (no Reposition)
 *  - Shape / line: Event Palette colours · Arrange · Duplicate · More
 *  - Image: Replace image… · Arrange · Duplicate · More
 *  - Group: Ungroup · Arrange · Duplicate · More
 *  - Several layers: Align · Group · Arrange · Duplicate · More
 * "More" holds the rest (Lock, Hide, Delete). Without an Event Palette the colour action becomes one "Event colors…"
 * button that opens the Colors drawer (never invented swatches).
 */

export type ToolbarKind = 'text' | 'photo' | 'image' | 'shape' | 'line' | 'group' | 'multi'

export type ToolbarAction =
  | 'edit-text'
  | 'colors'
  | 'photo-number'
  | 'frame'
  | 'replace-image'
  | 'ungroup'
  | 'align'
  | 'group'
  | 'arrange'
  | 'duplicate'
  | 'more'

export function toolbarKind(layers: readonly Layer[]): ToolbarKind | null {
  if (layers.length === 0) return null
  if (layers.length > 1) return 'multi'
  const l = layers[0]!
  if (l.type === 'shape') return l.shape === 'line' ? 'line' : 'shape'
  return l.type
}

const SETS: Readonly<Record<ToolbarKind, readonly ToolbarAction[]>> = {
  text: ['edit-text', 'colors', 'arrange', 'duplicate', 'more'],
  photo: ['photo-number', 'frame', 'arrange', 'duplicate', 'more'],
  image: ['replace-image', 'arrange', 'duplicate', 'more'],
  shape: ['colors', 'arrange', 'duplicate', 'more'],
  line: ['colors', 'arrange', 'duplicate', 'more'],
  group: ['ungroup', 'arrange', 'duplicate', 'more'],
  multi: ['align', 'group', 'arrange', 'duplicate', 'more']
}

/** The actions for a selection, in display order (3–5, "More" last). */
export const toolbarActions = (kind: ToolbarKind): readonly ToolbarAction[] => SETS[kind]

/** Action words (the toolbar uses words, not mystery icons). */
export const TOOLBAR_LABELS: Readonly<Record<ToolbarAction, string>> = {
  'edit-text': 'Edit text',
  colors: 'Colors',
  'photo-number': 'Photo number',
  frame: 'Frame',
  'replace-image': 'Replace image…',
  ungroup: 'Ungroup',
  align: 'Align',
  group: 'Group',
  arrange: 'Arrange',
  duplicate: 'Duplicate',
  more: 'More'
}

/**
 * Which colour property the palette dots edit: a text's fill, a shape's fill (its stroke when it has no fill), a
 * line's stroke. Null when the layer has no colour the toolbar can set.
 */
export type ColorTarget = 'fill' | 'stroke'
export function colorTarget(layer: Layer): ColorTarget | null {
  if (layer.type === 'text') return 'fill'
  if (layer.type === 'shape') {
    if (layer.shape === 'line') return layer.stroke ? 'stroke' : null
    return layer.fill ? 'fill' : layer.stroke ? 'stroke' : null
  }
  return null
}

/** The layer's current colour for that target (to mark the active dot). */
export function currentColor(layer: Layer, target: ColorTarget): ColorValue | null {
  if (layer.type === 'text') return target === 'fill' ? layer.fill : null
  if (layer.type === 'shape') return target === 'fill' ? layer.fill : (layer.stroke?.color ?? null)
  return null
}

/** At most this many Event Palette dots in the toolbar (the rest are in Properties and the Colors drawer). */
export const TOOLBAR_MAX_DOTS = 5

/**
 * When the toolbar shows: Design view only (never in Print Preview), a selection, no text being edited, nothing
 * being dragged or transformed, the Settings switch on, and every selected layer editable (a locked selection keeps
 * its Properties notice instead of offering actions that would do nothing).
 */
export function toolbarVisible(s: {
  enabled: boolean
  viewMode: 'design' | 'preview'
  editingText: boolean
  interacting: boolean
  project: TemplateProject | null
  selectedIds: readonly string[]
}): boolean {
  if (!s.enabled || s.viewMode !== 'design' || s.editingText || s.interacting) return false
  if (!s.project || s.selectedIds.length === 0) return false
  const layers = s.selectedIds
    .map((id) => s.project!.layers.find((l) => l.id === id))
    .filter((l): l is Layer => l !== undefined)
  return layers.length > 0 && layers.every((l) => isEditable(s.project!.layers, l))
}

/** Selection bounds (design px) → a rectangle in the canvas host's CSS px. */
export function toScreenRect(
  b: Bounds,
  view: { scale: number; offsetX: number; offsetY: number }
): Rect {
  return {
    left: view.offsetX + b.x * view.scale,
    top: view.offsetY + b.y * view.scale,
    width: b.width * view.scale,
    height: b.height * view.scale
  }
}

/**
 * Room kept above the selection for the canvas's rotate handle (28 px above the box plus the handle itself), so the
 * toolbar never covers it.
 */
export const ROTATE_HANDLE_ROOM = 36

/**
 * Where the toolbar goes inside the canvas host: above the selection (clear of the rotate handle), else below, else
 * beside it; always fully inside the host (the shared `placeFloating` rule). The anchor is clipped to the host first,
 * so a selection scrolled partly out of view still gets a toolbar next to its visible part.
 */
export function placeToolbar(opts: {
  selection: Rect
  size: { width: number; height: number }
  host: { width: number; height: number }
}): { left: number; top: number; side: 'top' | 'bottom' | 'left' | 'right' } {
  const { selection: s, host } = opts
  const left = Math.max(0, Math.min(s.left, host.width))
  const top = Math.max(0, Math.min(s.top, host.height))
  const right = Math.max(left, Math.min(s.left + s.width, host.width))
  const bottom = Math.max(top, Math.min(s.top + s.height, host.height))
  const room = Math.min(ROTATE_HANDLE_ROOM, top)
  return placeFloating({
    anchor: { left, top: top - room, width: right - left, height: bottom - top + room },
    size: opts.size,
    viewport: host,
    preferred: 'top',
    gap: 10,
    margin: 8
  })
}
