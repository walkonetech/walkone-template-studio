import {
  builtInFormat,
  formatDesignPrint,
  getPixelSize,
  paletteColor,
  literalColor,
  summarizeFormat,
  MM_PER_INCH,
  type FormatDefinition,
  type FormatSummary,
  type Layer,
  type PhotoLayer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import { addLayer, type MutationContext } from './mutations'
import { addPaletteColor } from './paletteMutations'
import { setCanvasBackgroundColor } from './assetMutations'
import { createNewLayer, DEFAULT_TEXT_FONT } from './newLayers'
import { presetIdFor, type PrintDpi } from './welcome'

/**
 * Phase 7C — Design Guide (docs/PHASE_7C_DESIGN_GUIDE.md).
 *
 * The Guide is a short sequence of questions that produces an ordinary starting design. Its answers are UI state (never
 * saved in the project); the design is DERIVED from them by `applyGuide`, a pure function over a freshly created project
 * that uses only the editor's existing mutations (`addLayer`, `addPaletteColor`, `setCanvasBackgroundColor`) and the
 * editor's own new-layer defaults (`createNewLayer`). Because the result is always recomputed from the answers and the
 * same empty project, going Back and Next can never duplicate a layer, and nothing in the result is Guide-specific:
 * normal photo slots, normal text layers, the normal Event Palette.
 */

export const GUIDE_STEPS = ['format', 'photos', 'style', 'text', 'review'] as const
export type GuideStep = (typeof GUIDE_STEPS)[number]

export const GUIDE_STEP_TITLES: Record<GuideStep, string> = {
  format: 'Choose your print size',
  photos: 'How many photos?',
  style: 'Choose your colors',
  text: 'Add event text',
  review: 'Review your design'
}
export const GUIDE_STEP_SHORT: Record<GuideStep, string> = {
  format: 'Size',
  photos: 'Photos',
  style: 'Colors',
  text: 'Text',
  review: 'Review'
}

// ---- answers --------------------------------------------------------------------------------------------------------

export type GuideFormatChoice = 'strip' | 'portrait' | 'landscape' | 'custom'
export type PhotoCount = 1 | 2 | 3 | 4
export const PHOTO_COUNTS: readonly PhotoCount[] = [1, 2, 3, 4]
export type PhotoLayoutId =
  | '1-large'
  | '1-centered'
  | '2-stacked'
  | '2-side'
  | '3-stacked'
  | '3-feature'
  | '4-grid'
  | '4-stacked'
/** Photo shape: Auto picks portrait or landscape per row from the space available (never stored: geometry only). */
export type SlotShape = 'auto' | 'portrait' | 'landscape' | 'square'
export type FrameChoice = 'none' | 'thin' | 'thick'
export type FrameColorChoice = 'accent' | 'white'
export type CornerChoice = 'square' | 'rounded'
export type TextAlign = 'left' | 'center' | 'right'
export type TextRole = 'title' | 'date' | 'message'
export const TEXT_ROLES: readonly TextRole[] = ['title', 'date', 'message']

export interface GuideColors {
  background: string
  accent: string
  text: string
}

export interface GuideAnswers {
  projectName: string
  formatChoice: GuideFormatChoice
  /** Resolution of the built-in sizes (a custom size carries its own). */
  dpi: PrintDpi
  /** The custom size made in the Custom Size wizard or picked from My formats (null until one is chosen). */
  customFormat: FormatDefinition | null
  photoCount: PhotoCount
  /** null = the recommended arrangement for this count and size. */
  layout: PhotoLayoutId | null
  shape: SlotShape
  /** Starting colour set id, or 'custom' once a colour was changed by hand. */
  colorSet: string
  colors: GuideColors
  frame: FrameChoice
  frameColor: FrameColorChoice
  corners: CornerChoice
  text: Record<TextRole, { on: boolean; value: string }>
  font: string
  titleBold: boolean
  align: TextAlign
}

/** Starting colour sets: app content shown as choices; only the three chosen values reach the project palette. */
export const COLOR_SETS: readonly { id: string; name: string; colors: GuideColors }[] = [
  {
    id: 'classic',
    name: 'Classic',
    colors: { background: '#ffffff', accent: '#c6a45d', text: '#222222' }
  },
  {
    id: 'blush',
    name: 'Blush',
    colors: { background: '#fbf1ee', accent: '#c97b84', text: '#4a3438' }
  },
  {
    id: 'garden',
    name: 'Garden',
    colors: { background: '#f3f5ee', accent: '#6d8a5c', text: '#2f3a2a' }
  },
  {
    id: 'midnight',
    name: 'Midnight',
    colors: { background: '#1d2433', accent: '#d8b46a', text: '#f4efe6' }
  },
  {
    id: 'bold',
    name: 'Bold',
    colors: { background: '#111111', accent: '#e94e3c', text: '#ffffff' }
  }
]

export function initialGuide(): GuideAnswers {
  return {
    projectName: 'Untitled',
    formatChoice: 'strip',
    dpi: 600,
    customFormat: null,
    photoCount: 3,
    layout: null,
    shape: 'auto',
    colorSet: 'classic',
    colors: { ...COLOR_SETS[0]!.colors },
    frame: 'thin',
    frameColor: 'accent',
    corners: 'square',
    text: {
      title: { on: true, value: '' },
      date: { on: false, value: '' },
      message: { on: false, value: '' }
    },
    font: DEFAULT_TEXT_FONT,
    titleBold: true,
    align: 'center'
  }
}

// ---- format ---------------------------------------------------------------------------------------------------------

/** The format the answers describe (null while "Custom size" is chosen but none was made yet). */
export function guideFormat(
  a: Pick<GuideAnswers, 'formatChoice' | 'dpi' | 'customFormat'>
): FormatDefinition | null {
  switch (a.formatChoice) {
    case 'strip':
      return builtInFormat(presetIdFor('strip-2x6', 'portrait', a.dpi))
    case 'portrait':
      return builtInFormat(presetIdFor('photo-4x6', 'portrait', a.dpi))
    case 'landscape':
      return builtInFormat(presetIdFor('photo-4x6', 'landscape', a.dpi))
    case 'custom':
      return a.customFormat
  }
}

interface DesignInfo {
  width: number
  height: number
  /** The generic safe margin in design pixels (0 when the format has none). */
  safePx: number
}

const designInfo = (f: FormatDefinition): DesignInfo => {
  const { width, height } = getPixelSize(formatDesignPrint(f))
  const safePx = f.safeMarginMm ? Math.round((f.safeMarginMm / MM_PER_INCH) * f.dpi) : 0
  return { width, height, safePx }
}

/** A narrow strip-like design (2×6 and similar): photos stack. */
const isNarrow = (d: { width: number; height: number }): boolean => d.width / d.height <= 0.5

// ---- photo layouts --------------------------------------------------------------------------------------------------

interface LayoutDef {
  id: PhotoLayoutId
  count: PhotoCount
  label: string
  /** Rows of slots (top to bottom), or columns (left to right) when `dir` is 'cols'. */
  groups: number[]
  dir: 'rows' | 'cols'
  /** Extra scale (the smaller "Centered" single photo). */
  scale?: number
}

const LAYOUTS: Record<PhotoLayoutId, Omit<LayoutDef, 'dir'> & { dir?: 'rows' | 'cols' }> = {
  '1-large': { id: '1-large', count: 1, label: 'Large', groups: [1] },
  '1-centered': { id: '1-centered', count: 1, label: 'Centered', groups: [1], scale: 0.78 },
  '2-stacked': { id: '2-stacked', count: 2, label: 'Stacked', groups: [1, 1] },
  '2-side': { id: '2-side', count: 2, label: 'Side by side', groups: [2] },
  '3-stacked': { id: '3-stacked', count: 3, label: 'Stacked', groups: [1, 1, 1] },
  // One large photo and two smaller ones: below it on tall designs, beside it on wide ones (see `layoutDef`).
  '3-feature': { id: '3-feature', count: 3, label: 'One large, two small', groups: [1, 2] },
  '4-grid': { id: '4-grid', count: 4, label: 'Grid', groups: [2, 2] },
  '4-stacked': { id: '4-stacked', count: 4, label: 'Stacked', groups: [1, 1, 1, 1] }
}

export const LAYOUTS_FOR: Record<PhotoCount, readonly PhotoLayoutId[]> = {
  1: ['1-large', '1-centered'],
  2: ['2-stacked', '2-side'],
  3: ['3-stacked', '3-feature'],
  4: ['4-grid', '4-stacked']
}

export const layoutLabel = (id: PhotoLayoutId): string => LAYOUTS[id].label

function layoutDef(id: PhotoLayoutId, d: { width: number; height: number }): LayoutDef {
  const base = LAYOUTS[id]
  const wide = d.width > d.height
  return { ...base, dir: id === '3-feature' && wide ? 'cols' : (base.dir ?? 'rows') }
}

/** The arrangement offered first for a photo count on this size (strips stack; wide designs go side by side). */
export function recommendedLayout(
  count: PhotoCount,
  d: { width: number; height: number }
): PhotoLayoutId {
  const narrow = isNarrow(d)
  const wide = d.width > d.height
  switch (count) {
    case 1:
      return '1-large'
    case 2:
      return wide ? '2-side' : '2-stacked'
    case 3:
      return narrow ? '3-stacked' : '3-feature'
    case 4:
      return narrow ? '4-stacked' : '4-grid'
  }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Space kept around the design's edge (and clear of a generic safe margin): 6 % of the short side. */
export function guideMargin(d: DesignInfo): number {
  const short = Math.min(d.width, d.height)
  return Math.max(Math.round(short * 0.06), d.safePx > 0 ? d.safePx + Math.round(short * 0.02) : 0)
}
const guideGap = (d: DesignInfo): number => Math.round(Math.min(d.width, d.height) * 0.04)
const TEXT_SHARE = 0.2

/** The design area for photos and the band for text below them (null when no text line is turned on). */
export function guideRegions(d: DesignInfo, hasText: boolean): { photos: Rect; text: Rect | null } {
  const m = guideMargin(d)
  const g = guideGap(d)
  const inner = { x: m, y: m, width: d.width - 2 * m, height: d.height - 2 * m }
  if (!hasText) return { photos: inner, text: null }
  const textH = Math.round(inner.height * TEXT_SHARE)
  return {
    photos: { ...inner, height: inner.height - textH - g },
    text: { x: inner.x, y: inner.y + inner.height - textH, width: inner.width, height: textH }
  }
}

const RATIO = { portrait: 2 / 3, landscape: 3 / 2, square: 1 } as const

/**
 * Photo slot rectangles (design pixels, whole numbers) for a layout inside an area. Every slot keeps a camera-like
 * shape (3:2, 2:3 or square), never the design's own proportions. Each row (or column) is as wide (tall) as the area
 * allows; if the rows are too tall together, everything is scaled down to fit; the block is centred.
 */
export function layoutSlots(area: Rect, def: LayoutDef, shape: SlotShape, gap: number): Rect[] {
  // Work in "row space": for columns, swap the axes, lay out rows, then swap back.
  const cols = def.dir === 'cols'
  const A = cols ? { x: area.y, y: area.x, width: area.height, height: area.width } : area
  const n = def.groups.length
  const shareH = (A.height - (n - 1) * gap) / n
  const rows = def.groups.map((k) => {
    const cellW = (A.width - (k - 1) * gap) / k
    // Auto: the cell's own orientation (in real space, so columns are judged correctly).
    const realLandscape = cols ? shareH >= cellW : cellW >= shareH
    const want: Exclude<SlotShape, 'auto'> =
      shape === 'auto' ? (realLandscape ? 'landscape' : 'portrait') : shape
    // Ratio in row space (width / height): columns use the inverse.
    const r = cols ? 1 / RATIO[want] : RATIO[want]
    return { k, w: cellW, h: cellW / r }
  })
  const fit = Math.min(1, (A.height - (n - 1) * gap) / rows.reduce((s, r) => s + r.h, 0))
  const scale = fit * (def.scale ?? 1)
  const blockH = rows.reduce((s, r) => s + r.h * scale, 0) + (n - 1) * gap
  let y = A.y + (A.height - blockH) / 2
  const out: Rect[] = []
  for (const r of rows) {
    const w = r.w * scale
    const h = r.h * scale
    const rowW = r.k * w + (r.k - 1) * gap
    let x = A.x + (A.width - rowW) / 2
    for (let i = 0; i < r.k; i++) {
      const rect = {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h)
      }
      out.push(cols ? { x: rect.y, y: rect.x, width: rect.height, height: rect.width } : rect)
      x += w + gap
    }
    y += h + gap
  }
  return out
}

export const effectiveLayout = (
  a: GuideAnswers,
  d: { width: number; height: number }
): PhotoLayoutId =>
  a.layout && LAYOUTS[a.layout].count === a.photoCount
    ? a.layout
    : recommendedLayout(a.photoCount, d)

const hasTextBand = (a: GuideAnswers): boolean => TEXT_ROLES.some((r) => a.text[r].on)

/** Where the Guide puts the photo slots for these answers on this format. */
export function guidePhotoRects(
  a: GuideAnswers,
  f: FormatDefinition,
  layout?: PhotoLayoutId
): Rect[] {
  const d = designInfo(f)
  const { photos } = guideRegions(d, hasTextBand(a))
  return layoutSlots(photos, layoutDef(layout ?? effectiveLayout(a, d), d), a.shape, guideGap(d))
}

// ---- text -----------------------------------------------------------------------------------------------------------

/** Width of one line of text in design pixels (injected: the renderer measures with a real canvas). */
export type MeasureText = (text: string, family: string, size: number, weight: number) => number
const estimate: MeasureText = (text, _f, size) => text.length * size * 0.55

const LINE_HEIGHT = 1.2
const ROLE_SCALE: Record<TextRole, number> = { title: 1, date: 0.42, message: 0.42 }
export const ROLE_NAMES: Record<TextRole, string> = {
  title: 'Event name',
  date: 'Date',
  message: 'Message'
}

export interface TextPlacement {
  role: TextRole
  content: string
  rect: Rect
  fontSize: number
  fontWeight: number
}

/**
 * The text lines, top to bottom, centred in the text band. Sizes follow the band's height; a line that would be wider
 * than the band is set smaller so it fits on one line (a starting size only: nothing keeps fitting it afterwards, and
 * the normal overflow Checks apply once it is edited — ADR-052 stays open).
 */
export function guideTextPlacements(
  a: GuideAnswers,
  f: FormatDefinition,
  measure: MeasureText = estimate
): TextPlacement[] {
  const d = designInfo(f)
  const band = guideRegions(d, hasTextBand(a)).text
  if (!band) return []
  const lines = TEXT_ROLES.filter((r) => a.text[r].on && a.text[r].value.trim() !== '')
  if (lines.length === 0) return []
  const spacing = 0.18
  // Total height in units of the title size: each line's height plus the space between lines.
  const units =
    lines.reduce((s, r) => s + ROLE_SCALE[r] * LINE_HEIGHT, 0) + spacing * (lines.length - 1)
  const title = Math.min((band.height * 0.92) / units, band.height * 0.55)
  const placed = lines.map((role) => {
    const content = a.text[role].value.trim()
    const weight = role === 'title' && a.titleBold ? 700 : 400
    let size = Math.max(1, Math.round(title * ROLE_SCALE[role]))
    const width = measure(content, a.font, size, weight)
    if (width > band.width) size = Math.max(1, Math.floor((size * band.width) / width))
    return { role, content, fontSize: size, fontWeight: weight }
  })
  const heights = placed.map((p) => Math.round(p.fontSize * LINE_HEIGHT))
  const gaps = Math.round(title * spacing)
  const blockH = heights.reduce((s, h) => s + h, 0) + gaps * (placed.length - 1)
  let y = band.y + Math.round((band.height - blockH) / 2)
  return placed.map((p, i) => {
    const rect = { x: band.x, y, width: band.width, height: heights[i]! }
    y += heights[i]! + gaps
    return { ...p, rect }
  })
}

// ---- applying the answers -------------------------------------------------------------------------------------------

export interface ApplyGuideOptions extends MutationContext {
  measure?: MeasureText
}

/**
 * The starting design: the answers applied to a NEW, EMPTY project of the chosen format, with the editor's own
 * mutations. Same input → same project (ids come from `ctx.createId`).
 */
export function applyGuide(
  empty: TemplateProject,
  a: GuideAnswers,
  options: ApplyGuideOptions = {}
): TemplateProject {
  const f = guideFormat(a)
  if (!f) return empty
  const ctx: MutationContext = {
    ...(options.now ? { now: options.now } : {}),
    ...(options.createId ? { createId: options.createId } : {})
  }
  const d = designInfo(f)
  let p = empty
  // Event Palette: the three colours the operator chose, as normal palette entries the editor reads and edits.
  const ids: Partial<Record<keyof GuideColors, string>> = {}
  for (const role of ['background', 'accent', 'text'] as const) {
    const r = addPaletteColor(p, { role, value: a.colors[role] }, ctx)
    p = r.project
    ids[role] = r.id
  }
  p = setCanvasBackgroundColor(p, paletteColor(ids.background!), ctx)

  // Photo slots: the editor's own "Add photo" layer (numbered 1, 2, 3 …), placed and framed.
  const thin = Math.max(6, Math.round(d.width * 0.005))
  for (const rect of guidePhotoRects(a, f)) {
    const base = createNewLayer(p, 'photo', options.createId) as PhotoLayer
    const slot: PhotoLayer = {
      ...base,
      ...rect,
      frame:
        a.frame === 'none'
          ? { style: 'none' }
          : {
              style: 'solid',
              thickness: a.frame === 'thick' ? Math.round(thin * 2.5) : thin,
              color: a.frameColor === 'accent' ? paletteColor(ids.accent!) : literalColor('#ffffff')
            },
      cornerRadius:
        a.corners === 'rounded' ? Math.round(Math.min(rect.width, rect.height) * 0.05) : 0
    }
    p = addLayer(p, slot, ctx)
  }

  // Text: the editor's own text layer, one per line the operator filled in.
  for (const t of guideTextPlacements(a, f, options.measure)) {
    const base = createNewLayer(p, 'text', options.createId) as TextLayer
    const layer: TextLayer = {
      ...base,
      ...t.rect,
      name: ROLE_NAMES[t.role],
      content: t.content,
      fontFamily: a.font,
      fontSize: t.fontSize,
      fontWeight: t.fontWeight,
      align: a.align,
      lineHeight: LINE_HEIGHT,
      fill: paletteColor(ids.text!)
    }
    p = addLayer(p, layer, ctx)
  }
  return p
}

// ---- validation and summary -----------------------------------------------------------------------------------------

export interface GuideIssue {
  field: 'format' | `text-${TextRole}`
  message: string
}

const TEXT_MISSING: Record<TextRole, string> = {
  title: 'Type the event name, or turn it off.',
  date: 'Type the date, or turn it off.',
  message: 'Type the message, or turn it off.'
}

export function guideIssues(a: GuideAnswers, step: GuideStep): GuideIssue[] {
  if (step === 'format' && guideFormat(a) === null)
    return [{ field: 'format', message: 'Make a custom size first, or choose another size.' }]
  if (step === 'text')
    return TEXT_ROLES.filter((r) => a.text[r].on && a.text[r].value.trim() === '').map((r) => ({
      field: `text-${r}` as const,
      message: TEXT_MISSING[r]
    }))
  return []
}

export const guideNext = (s: GuideStep): GuideStep =>
  GUIDE_STEPS[Math.min(GUIDE_STEPS.indexOf(s) + 1, GUIDE_STEPS.length - 1)]!
export const guideBack = (s: GuideStep): GuideStep =>
  GUIDE_STEPS[Math.max(GUIDE_STEPS.indexOf(s) - 1, 0)]!

/** "Open in editor" is offered once a size exists (the editor needs a real format). */
export const canOpenInEditor = (a: GuideAnswers): boolean => guideFormat(a) !== null

export interface GuideSummary {
  format: FormatSummary & { name: string }
  photos: string
  colors: GuideColors
  text: string
  font: string
}

export function guideSummary(a: GuideAnswers): GuideSummary | null {
  const f = guideFormat(a)
  if (!f) return null
  const d = designInfo(f)
  const layout = effectiveLayout(a, d)
  const shape = a.shape === 'auto' ? 'shape chosen automatically' : `${a.shape} photos`
  const lines = TEXT_ROLES.filter((r) => a.text[r].on && a.text[r].value.trim() !== '').map(
    (r) => `${ROLE_NAMES[r]}: “${a.text[r].value.trim()}”`
  )
  return {
    format: { ...summarizeFormat(f), name: f.name },
    photos: `${a.photoCount} ${a.photoCount === 1 ? 'photo' : 'photos'} · ${layoutLabel(layout)} · ${shape}`,
    colors: { ...a.colors },
    text: lines.length > 0 ? lines.join(' · ') : 'No text',
    font: `${a.font}${a.titleBold ? ', bold event name' : ''} · aligned ${a.align}`
  }
}

/** Layers created by the Guide, by kind (for the Review step and tests). */
export function countKinds(layers: readonly Layer[]): { photos: number; texts: number } {
  return {
    photos: layers.filter((l) => l.type === 'photo').length,
    texts: layers.filter((l) => l.type === 'text').length
  }
}
