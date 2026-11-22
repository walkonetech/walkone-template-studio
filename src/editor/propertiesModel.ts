import type { Layer, PhotoLayer, ShapeLayer, TextLayer } from '@domain'
import { formatNumber } from './numberInput'

/**
 * The Properties panel's structure (Phase 7B B5, B1 mockups 03/04): a pinned header, ESSENTIALS that are always
 * visible, then collapsible sections that each show a one-line summary while closed. Pure presentation: every field
 * still edits the same layer property through the same store action as before; nothing here changes the schema.
 *
 * Essentials (what an operator changes most):
 *  - Text: Content · Font · Style + Size · Color · Align
 *  - Photo slot: Photo number · Fit · Frame (+ its colour) · Corner radius
 *  - Image: Role · Fit · Opacity · print quality · Replace / Original size / Set as background
 *  - Shape: Shape · Fill · Stroke (+ width) · Corner radius (rectangles)
 *  - Group: what is inside · Ungroup
 *  - Several layers: Align and distribute · Opacity · Visible / Locked · Duplicate / Group / Delete
 * Sections (closed by default, with a summary): Position & size, Spacing & box (text), Frame details (photo),
 * Image details (image), Appearance, Align to canvas, Layer.
 */

export type SectionId =
  | 'position'
  | 'spacing'
  | 'frame-details'
  | 'image-details'
  | 'appearance'
  | 'align'
  | 'layer'
  | 'selection-position'
  | 'printing-notes'

/** Sections start closed (the summary says what is inside); a section the user opens stays open for this session. */
export const SECTION_DEFAULT_OPEN: Readonly<Record<SectionId, boolean>> = {
  position: false,
  spacing: false,
  'frame-details': false,
  'image-details': false,
  appearance: false,
  align: false,
  layer: false,
  'selection-position': false,
  'printing-notes': false
}

export const ESSENTIALS: Readonly<Record<Layer['type'] | 'multi', readonly string[]>> = {
  text: ['Content', 'Font', 'Style', 'Size', 'Color', 'Align'],
  photo: ['Photo number', 'Fit', 'Frame', 'Corner radius'],
  image: ['Role', 'Fit', 'Opacity', 'Print quality'],
  shape: ['Shape', 'Fill', 'Stroke'],
  group: ['Layers inside', 'Ungroup'],
  multi: ['Align and distribute', 'Opacity', 'Visible', 'Locked']
}

const n = (v: number): string => formatNumber(Math.round(v * 100) / 100)

/** "X 120 · Y 2700 · 960 × 270" (+ " · 3°" when rotated). */
export function positionSummary(
  l: Pick<Layer, 'x' | 'y' | 'width' | 'height' | 'rotation'>
): string {
  const parts = [`X ${n(l.x)}`, `Y ${n(l.y)}`, `${n(l.width)} × ${n(l.height)}`]
  if (l.rotation) parts.push(`${n(l.rotation)}°`)
  return parts.join(' · ')
}

/** "Line 1.2 · Letter 0". */
export const spacingSummary = (t: TextLayer): string =>
  `Line ${n(t.lineHeight)} · Letter ${n(t.letterSpacing)}`

/** "Opacity 100 %". */
export const appearanceSummary = (l: Pick<Layer, 'opacity'>): string =>
  `Opacity ${Math.round(l.opacity * 100)} %`

/** "Solid · 12 px" or "No frame". */
export function frameSummary(p: PhotoLayer): string {
  return p.frame.style === 'solid' ? `Solid · ${n(p.frame.thickness)} px` : 'No frame'
}

/** "Fill · Stroke 6 px", "Fill only", "Stroke 6 px", "No fill or stroke". */
export function shapeSummary(s: ShapeLayer): string {
  if (s.fill && s.stroke) return `Fill · Stroke ${n(s.stroke.width)} px`
  if (s.fill) return 'Fill only'
  if (s.stroke) return `Stroke ${n(s.stroke.width)} px`
  return 'No fill or stroke'
}

/** "Visible · Unlocked" style summary for the Layer section. */
export const layerSummary = (l: Pick<Layer, 'visible' | 'locked'>): string =>
  `${l.visible ? 'Visible' : 'Hidden'} · ${l.locked ? 'Locked' : 'Unlocked'}`

const KIND_WORD: Readonly<Record<Layer['type'], [string, string]>> = {
  text: ['text', 'texts'],
  photo: ['photo slot', 'photo slots'],
  image: ['image', 'images'],
  shape: ['shape', 'shapes'],
  group: ['group', 'groups']
}

const TYPE_TITLE: Readonly<Record<Layer['type'], string>> = {
  text: 'Text',
  photo: 'Photo slot',
  image: 'Image',
  shape: 'Shape',
  group: 'Group'
}

/**
 * The pinned header: the layer's name and what it is ("Text · in Title block", "Photo slot #2"), or for several
 * layers "3 layers selected" and what they are ("2 texts · 1 shape").
 */
export function propertiesHeader(
  layers: readonly Layer[],
  all: readonly Layer[]
): { title: string; subtitle: string } {
  if (layers.length === 1) {
    const l = layers[0]!
    const parent = l.parentId ? all.find((p) => p.id === l.parentId) : undefined
    const kind = l.type === 'photo' ? `Photo slot #${l.photoNumber}` : TYPE_TITLE[l.type]
    return { title: l.name, subtitle: parent ? `${kind} · in ${parent.name}` : kind }
  }
  const counts = new Map<Layer['type'], number>()
  for (const l of layers) counts.set(l.type, (counts.get(l.type) ?? 0) + 1)
  const subtitle = [...counts.entries()]
    .map(([t, c]) => `${c} ${KIND_WORD[t][c === 1 ? 0 : 1]}`)
    .join(' · ')
  return { title: `${layers.length} layers selected`, subtitle }
}

/** One value shared by every layer, or 'mixed' (several layers never show a misleading single value). */
export function sharedValue<T>(layers: readonly Layer[], get: (l: Layer) => T): T | 'mixed' {
  const first = layers[0]
  if (!first) return 'mixed'
  const v = get(first)
  return layers.every((l) => Object.is(get(l), v)) ? v : 'mixed'
}

// ---- text style: weight + italic as ONE "Style" choice (B1 mockup 03: "Regular" beside the size)

const WEIGHT_NAMES: Readonly<Record<number, string>> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semibold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black'
}

export interface TextStyleOption {
  value: string
  label: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
}

export const TEXT_STYLE_OPTIONS: readonly TextStyleOption[] = [
  100, 200, 300, 400, 500, 600, 700, 800, 900
].flatMap((w) =>
  (['normal', 'italic'] as const).map((st) => ({
    value: `${w}-${st}`,
    label:
      st === 'italic' ? (w === 400 ? 'Italic' : `${WEIGHT_NAMES[w]} Italic`) : WEIGHT_NAMES[w]!,
    fontWeight: w,
    fontStyle: st
  }))
)

/** The Style value for a text layer (its weight snapped to the nearest hundred). */
export function textStyleValue(t: Pick<TextLayer, 'fontWeight' | 'fontStyle'>): string {
  const w = Math.min(900, Math.max(100, Math.round(t.fontWeight / 100) * 100))
  return `${w}-${t.fontStyle === 'italic' ? 'italic' : 'normal'}`
}

export const textStyleFromValue = (
  v: string
): { fontWeight: number; fontStyle: 'normal' | 'italic' } | null => {
  const o = TEXT_STYLE_OPTIONS.find((x) => x.value === v)
  return o ? { fontWeight: o.fontWeight, fontStyle: o.fontStyle } : null
}
