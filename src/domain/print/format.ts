import { z } from 'zod'
import { FiniteNumberSchema, NonNegativeNumberSchema, PositiveNumberSchema } from '../primitives'
import {
  checkComposition,
  createSingleOutput,
  normalizeGridLayout,
  type OutputComposition,
  type SheetMargins
} from './composition'
import {
  MAX_DPI,
  MAX_PHYSICAL_SIDE_IN,
  MAX_PIXEL_SIDE,
  PRINT_PRESETS,
  getOrientation,
  inchesToPixels,
  type Orientation,
  type PrintConfiguration,
  type PrintPresetId
} from './print'

/**
 * Format definitions (Phase 7B B5.5, ADR-059). A FORMAT says what is being designed (the design size and resolution)
 * and how it is arranged for output (one exact-size copy, or copies on a larger sheet), plus two pieces of editor
 * guidance: a generic design safe margin and whether Print Preview shows cut guides. It is NOT an Output Profile
 * (printer, media, measured trim): those stay outside the project and outside formats (ADR-053).
 *
 * Built-in formats (2×6 strip, 4×6 portrait, 6×4 landscape) and custom formats use this one model, and both create
 * projects through `createProjectFromFormat` → `createProject`, so there is one project-creation path.
 *
 * CANONICAL REPRESENTATION: lengths are stored in INCHES (finite, unrounded) plus an integer DPI, exactly like the
 * project's `PrintConfiguration`. Millimetres and pixels are views of that value:
 *   - mm → in: value / 25.4 (exact factor, never rounded on the way in);
 *   - px → in: value / dpi;
 *   - raster size: Math.round(inches × dpi) (the domain's `inchesToPixels`), the only place a length is rounded;
 *   - display: inches to 3 decimals, millimetres to 2, pixels as whole numbers (display only).
 * Switching the display unit never rewrites the stored inches, so switching back and forth cannot drift.
 */

export const MM_PER_INCH = 25.4

export const LENGTH_UNITS = ['in', 'mm', 'px'] as const
export type LengthUnit = (typeof LENGTH_UNITS)[number]

/** A length in `unit` → inches at `dpi` (px only). Unrounded. */
export function toInches(value: number, unit: LengthUnit, dpi: number): number {
  if (unit === 'mm') return value / MM_PER_INCH
  if (unit === 'px') return value / dpi
  return value
}

/** Inches → a length in `unit` at `dpi`. Unrounded, except pixels, which are whole raster pixels. */
export function fromInches(inches: number, unit: LengthUnit, dpi: number): number {
  if (unit === 'mm') return inches * MM_PER_INCH
  if (unit === 'px') return inchesToPixels(inches, dpi)
  return inches
}

const DISPLAY_DECIMALS: Record<LengthUnit, number> = { in: 3, mm: 2, px: 0 }

/** A number for display in `unit`: in 3 decimals, mm 2, px whole; trailing zeros dropped, never "-0". */
export function displayNumber(value: number, unit: LengthUnit): string {
  const f = 10 ** DISPLAY_DECIMALS[unit]
  const r = Math.round(value * f) / f
  return String(Object.is(r, -0) ? 0 : r)
}

/** "2.25 in", "50 mm", "675 px" for an inch value. */
export function displayLength(inches: number, unit: LengthUnit, dpi: number): string {
  return `${displayNumber(fromInches(inches, unit, dpi), unit)} ${unit}`
}

/** "2.25 × 3.25 in" for a size in inches shown in `unit`. */
export function displaySize(width: number, height: number, unit: LengthUnit, dpi: number): string {
  return `${displayNumber(fromInches(width, unit, dpi), unit)} × ${displayNumber(fromInches(height, unit, dpi), unit)} ${unit}`
}

// ---- limits ---------------------------------------------------------------------------------------------------------

/**
 * Largest raster a format may produce, per canvas (design or sheet): 64 megapixels ≈ 256 MB as RGBA. Export draws the
 * design and the sheet as full-size canvases and encodes PNGs from them, so the limit is about renderer memory, not
 * about print sizes: 8×10 in @ 600 DPI is 28.8 MP and 12×18 in @ 300 DPI is 19.4 MP, both well inside it. The
 * schema's per-side limits (100 in, 30 000 px) still apply.
 */
export const MAX_FORMAT_PIXELS = 64_000_000
/** Smallest side, in raster pixels: anything smaller cannot hold a readable design. */
export const MIN_FORMAT_PIXEL_SIDE = 10
export const MAX_GRID = 8
export const MAX_GAP_IN = 10
export const MAX_MARGIN_IN = 50
export const MAX_SAFE_MARGIN_MM = 50
export const RECOMMENDED_SAFE_MARGIN_MM = 3

// ---- definition -----------------------------------------------------------------------------------------------------

const LengthIn = PositiveNumberSchema.max(MAX_PHYSICAL_SIDE_IN)

export const FormatSheetSchema = z.strictObject({
  /** 'repeat' = the simple choice (one gap, one margin, centred); 'custom' = every value explicit. Same geometry model. */
  kind: z.enum(['repeat', 'custom']),
  sheetWidth: LengthIn,
  sheetHeight: LengthIn,
  columns: z.number().int().min(1).max(MAX_GRID),
  rows: z.number().int().min(1).max(MAX_GRID),
  columnGap: NonNegativeNumberSchema.max(MAX_GAP_IN),
  rowGap: NonNegativeNumberSchema.max(MAX_GAP_IN),
  margins: z.strictObject({
    top: NonNegativeNumberSchema.max(MAX_MARGIN_IN),
    right: NonNegativeNumberSchema.max(MAX_MARGIN_IN),
    bottom: NonNegativeNumberSchema.max(MAX_MARGIN_IN),
    left: NonNegativeNumberSchema.max(MAX_MARGIN_IN)
  }),
  /** Centre the copies inside the margins, or start them at the top-left margin. */
  align: z.enum(['center', 'start'])
})
export type FormatSheet = z.infer<typeof FormatSheetSchema>

export const FormatArrangementSchema = z.union([
  z.strictObject({ kind: z.literal('exact') }),
  FormatSheetSchema
])
export type FormatArrangement = z.infer<typeof FormatArrangementSchema>

export const FormatDefinitionSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  /** Design size in inches (canonical) and resolution. */
  width: LengthIn,
  height: LengthIn,
  dpi: z.number().int().min(1).max(MAX_DPI),
  /** The unit the operator entered the size in (display preference only). */
  unit: z.enum(LENGTH_UNITS),
  arrangement: FormatArrangementSchema,
  /** Generic design safe margin in mm; null = none. Not printer evidence. */
  safeMarginMm: FiniteNumberSchema.min(0).max(MAX_SAFE_MARGIN_MM).nullable(),
  /** Show cut guides in Print Preview (editor guidance; never printed). */
  cutGuides: z.boolean()
})
export type FormatDefinition = z.infer<typeof FormatDefinitionSchema>

export const isSheetArrangement = (a: FormatArrangement): a is FormatSheet => a.kind !== 'exact'

/** The design's print configuration (key order as the built-in presets, so saved files match). */
export const formatDesignPrint = (
  f: Pick<FormatDefinition, 'width' | 'height' | 'dpi'>
): PrintConfiguration => ({
  width: f.width,
  height: f.height,
  unit: 'in',
  dpi: f.dpi
})

/** The project's OutputComposition for a format. Plain grids carry no optional fields (pre-B5.5 shape). */
export function formatComposition(f: FormatDefinition): OutputComposition {
  const design = formatDesignPrint(f)
  const a = f.arrangement
  if (!isSheetArrangement(a)) return createSingleOutput(design)
  return {
    print: { width: a.sheetWidth, height: a.sheetHeight, unit: 'in', dpi: f.dpi },
    layout: normalizeGridLayout({
      kind: 'grid',
      columns: a.columns,
      rows: a.rows,
      gap: a.columnGap,
      rowGap: a.rowGap,
      margins: { ...a.margins } satisfies SheetMargins,
      align: a.align
    })
  }
}

export const copiesOf = (f: Pick<FormatDefinition, 'arrangement'>): number =>
  isSheetArrangement(f.arrangement) ? f.arrangement.columns * f.arrangement.rows : 1

export function formatOrientation(width: number, height: number): Orientation {
  return getOrientation({ width, height, unit: 'in', dpi: 1 })
}

// ---- validation -----------------------------------------------------------------------------------------------------

export type FormatField =
  | 'width'
  | 'height'
  | 'dpi'
  | 'sheetWidth'
  | 'sheetHeight'
  | 'columns'
  | 'rows'
  | 'columnGap'
  | 'rowGap'
  | 'margins'
  | 'fit'
  | 'safeMargin'
  | 'name'

export interface FormatIssue {
  field: FormatField
  message: string
}

const okNumber = (v: number): boolean => typeof v === 'number' && Number.isFinite(v)
const fmtIn = (v: number): string => `${Math.round(v * 1000) / 1000} in`

/** Checks one physical side (design or sheet) in inches at `dpi`. */
function sideIssue(label: string, inches: number, dpi: number): string | null {
  if (!okNumber(inches)) return `Enter a number for the ${label}.`
  if (inches <= 0) return `The ${label} must be greater than zero.`
  if (inches > MAX_PHYSICAL_SIDE_IN)
    return `The ${label} can be at most ${MAX_PHYSICAL_SIDE_IN} in (${MAX_PHYSICAL_SIDE_IN * MM_PER_INCH} mm).`
  if (okNumber(dpi) && dpi >= 1) {
    const px = inchesToPixels(inches, dpi)
    if (px < MIN_FORMAT_PIXEL_SIDE)
      return `The ${label} is only ${px} px at ${dpi} DPI; it needs at least ${MIN_FORMAT_PIXEL_SIDE} px.`
    if (px > MAX_PIXEL_SIDE)
      return `The ${label} would be ${px.toLocaleString('en-US')} px at ${dpi} DPI; the limit is ${MAX_PIXEL_SIDE.toLocaleString('en-US')} px. Use a lower resolution.`
  }
  return null
}

function areaIssue(what: string, w: number, h: number, dpi: number): string | null {
  if (![w, h, dpi].every(okNumber) || w <= 0 || h <= 0 || dpi < 1) return null
  const px = inchesToPixels(w, dpi) * inchesToPixels(h, dpi)
  if (px <= MAX_FORMAT_PIXELS) return null
  return `The ${what} would be ${(px / 1e6).toFixed(1)} megapixels at ${dpi} DPI; the limit is ${MAX_FORMAT_PIXELS / 1e6} megapixels. Use a lower resolution or a smaller size.`
}

/**
 * Everything that would make a format unusable, in plain language (empty = valid). The wizard shows these next to
 * the fields and disables Create while any remains; the same rules guard the main process.
 */
export function validateFormat(f: FormatDefinition): FormatIssue[] {
  const issues: FormatIssue[] = []
  const add = (field: FormatField, message: string | null): void => {
    if (message) issues.push({ field, message })
  }
  if (!f.name || f.name.trim().length === 0) add('name', 'Give the format a name.')
  if (!okNumber(f.dpi) || !Number.isInteger(f.dpi) || f.dpi < 1 || f.dpi > MAX_DPI)
    add('dpi', `Resolution must be a whole number from 1 to ${MAX_DPI} DPI.`)
  add('width', sideIssue('width', f.width, f.dpi))
  add('height', sideIssue('height', f.height, f.dpi))
  if (!issues.some((i) => i.field === 'width' || i.field === 'height'))
    add('width', areaIssue('design', f.width, f.height, f.dpi))

  const a = f.arrangement
  if (isSheetArrangement(a)) {
    add('sheetWidth', sideIssue('sheet width', a.sheetWidth, f.dpi))
    add('sheetHeight', sideIssue('sheet height', a.sheetHeight, f.dpi))
    if (!issues.some((i) => i.field === 'sheetWidth' || i.field === 'sheetHeight'))
      add('sheetWidth', areaIssue('sheet', a.sheetWidth, a.sheetHeight, f.dpi))
    const count = (label: string, v: number): string | null =>
      okNumber(v) && Number.isInteger(v) && v >= 1 && v <= MAX_GRID
        ? null
        : `${label} must be a whole number from 1 to ${MAX_GRID}.`
    add('columns', count('Copies across', a.columns))
    add('rows', count('Copies down', a.rows))
    const gap = (label: string, v: number): string | null =>
      !okNumber(v)
        ? `Enter a number for the ${label}.`
        : v < 0
          ? `The ${label} cannot be negative.`
          : v > MAX_GAP_IN
            ? `The ${label} can be at most ${MAX_GAP_IN} in.`
            : null
    add('columnGap', gap('gap between columns', a.columnGap))
    add('rowGap', gap('gap between rows', a.rowGap))
    const m = a.margins
    const badMargin = [m.top, m.right, m.bottom, m.left].find(
      (v) => !okNumber(v) || v < 0 || v > MAX_MARGIN_IN
    )
    if (badMargin !== undefined)
      add(
        'margins',
        !okNumber(badMargin)
          ? 'Enter a number for every margin.'
          : badMargin < 0
            ? 'Margins cannot be negative.'
            : `Margins can be at most ${MAX_MARGIN_IN} in.`
      )
    if (issues.length === 0) {
      const needW = a.columns * f.width + (a.columns - 1) * a.columnGap
      const needH = a.rows * f.height + (a.rows - 1) * a.rowGap
      const availW = a.sheetWidth - m.left - m.right
      const availH = a.sheetHeight - m.top - m.bottom
      const problems = checkComposition(formatDesignPrint(f), formatComposition(f))
      if (problems.length > 0 || availW <= 0 || availH <= 0) {
        const n = a.columns * a.rows
        add(
          'fit',
          `${n} ${n === 1 ? 'copy needs' : 'copies need'} ${fmtIn(needW)} × ${fmtIn(needH)}, but the sheet has ${fmtIn(Math.max(0, availW))} × ${fmtIn(Math.max(0, availH))}${m.top + m.right + m.bottom + m.left > 0 ? ' inside its margins' : ''}. Use fewer copies, smaller gaps or margins, or a larger sheet. The design is never scaled to fit.`
        )
      }
    }
  }

  if (f.safeMarginMm !== null) {
    const v = f.safeMarginMm
    const shortMm = Math.min(f.width, f.height) * MM_PER_INCH
    if (!okNumber(v)) add('safeMargin', 'Enter a number for the safe margin.')
    else if (v < 0) add('safeMargin', 'The safe margin cannot be negative.')
    else if (v > MAX_SAFE_MARGIN_MM)
      add('safeMargin', `The safe margin can be at most ${MAX_SAFE_MARGIN_MM} mm.`)
    else if (okNumber(shortMm) && shortMm > 0 && v * 2 >= shortMm)
      add(
        'safeMargin',
        `A ${Math.round(v * 100) / 100} mm margin on both sides leaves no room on a ${Math.round(shortMm * 10) / 10} mm side.`
      )
  }
  return issues
}

// ---- summary --------------------------------------------------------------------------------------------------------

export interface FormatSummary {
  /** "2.25 × 3.25 in" in the entered unit. */
  design: string
  /** "675 × 975 px @ 300 DPI". */
  pixels: string
  orientation: Orientation
  /** "Exact size: one design per print" / "4 copies on a 4 × 6 in sheet". */
  output: string
  /** "2 across × 2 down" (null for exact size). */
  layout: string | null
  /** "Gaps 0.1 in · margins 0.25 in · centred" (null for exact size). */
  spacing: string | null
  /** "3 mm generic safe margin" / "No generic safe margin". */
  safeMargin: string
  /** "Cut guides shown in Print Preview" / "No cut guides". */
  cutGuides: string
}

/** Plain-language summary of a format (the wizard's Review step and the My formats cards). */
export function summarizeFormat(f: FormatDefinition): FormatSummary {
  const sheetUnit: LengthUnit = f.unit === 'px' ? 'in' : f.unit
  const a = f.arrangement
  const px = `${inchesToPixels(f.width, f.dpi)} × ${inchesToPixels(f.height, f.dpi)} px @ ${f.dpi} DPI`
  const l = (v: number): string => displayLength(v, sheetUnit, f.dpi)
  let output = 'Exact size: one design per print'
  let layout: string | null = null
  let spacing: string | null = null
  if (isSheetArrangement(a)) {
    const n = a.columns * a.rows
    output = `${n} ${n === 1 ? 'copy' : 'copies'} on a ${displaySize(a.sheetWidth, a.sheetHeight, sheetUnit, f.dpi)} sheet`
    layout = `${a.columns} across × ${a.rows} down`
    const m = a.margins
    const gaps =
      a.columnGap === a.rowGap
        ? `Gaps ${l(a.columnGap)}`
        : `Gaps ${l(a.columnGap)} across, ${l(a.rowGap)} down`
    const uniform = m.top === m.right && m.right === m.bottom && m.bottom === m.left
    const margins = uniform
      ? `margins ${l(m.top)}`
      : `margins ${l(m.top)} top, ${l(m.right)} right, ${l(m.bottom)} bottom, ${l(m.left)} left`
    spacing = `${gaps} · ${margins} · ${a.align === 'center' ? 'centred' : 'from the top-left margin'}`
  }
  return {
    design: displaySize(f.width, f.height, f.unit, f.dpi),
    pixels: px,
    orientation: formatOrientation(f.width, f.height),
    output,
    layout,
    spacing,
    safeMargin:
      f.safeMarginMm === null || f.safeMarginMm === 0
        ? 'No generic safe margin'
        : `${displayNumber(f.safeMarginMm, 'mm')} mm generic safe margin`,
    cutGuides: f.cutGuides ? 'Cut guides shown in Print Preview' : 'No cut guides'
  }
}

// ---- built-in formats -----------------------------------------------------------------------------------------------

/** The built-in formats, as definitions over the existing presets (immutable; never stored, never deleted). */
export function builtInFormat(id: PrintPresetId): FormatDefinition {
  const p = PRINT_PRESETS[id]
  const strip = id.startsWith('strip-')
  return {
    name: strip
      ? '2×6 Strip'
      : `${p.width}×${p.height} ${formatOrientation(p.width, p.height) === 'portrait' ? 'Portrait' : 'Landscape'}`,
    width: p.width,
    height: p.height,
    dpi: p.dpi,
    unit: 'in',
    arrangement: strip
      ? {
          kind: 'repeat',
          sheetWidth: p.width * 2,
          sheetHeight: p.height,
          columns: 2,
          rows: 1,
          columnGap: 0,
          rowGap: 0,
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          align: 'center'
        }
      : { kind: 'exact' },
    safeMarginMm: null,
    cutGuides: true
  }
}
