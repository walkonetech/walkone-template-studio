import {
  RECOMMENDED_SAFE_MARGIN_MM,
  displayNumber,
  formatOrientation,
  isSheetArrangement,
  validateFormat,
  type FormatDefinition,
  type FormatIssue,
  type FormatSheet,
  type LengthUnit
} from '@domain'

/**
 * The Custom Size wizard's state (Phase 7B B5.5). Pure: no React, no store. Every length is held in INCHES (the
 * canonical representation, see `@domain` format.ts); fields show it in the chosen unit. Nothing here touches a
 * project: browsing the wizard never creates, changes or dirties one.
 */

export const WIZARD_STEPS = ['size', 'output', 'safe', 'review'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const STEP_TITLES: Record<WizardStep, string> = {
  size: 'What size are you designing?',
  output: 'How should it print?',
  safe: 'Safe margin',
  review: 'Review your format'
}

export const STEP_SHORT: Record<WizardStep, string> = {
  size: 'Size',
  output: 'Printing',
  safe: 'Safe margin',
  review: 'Review'
}

export type ArrangementMode = 'exact' | 'repeat' | 'custom'
export type SafeMode = 'none' | 'recommended' | 'custom'
export type DpiChoice = 300 | 600 | 'custom'

export interface WizardState {
  step: WizardStep
  name: string
  unit: LengthUnit
  dpi: number
  /** Which resolution control is chosen; `dpi` holds the value either way. */
  dpiChoice: DpiChoice
  width: number
  height: number
  mode: ArrangementMode
  sheet: Omit<FormatSheet, 'kind'>
  safe: SafeMode
  /** Custom generic safe margin, mm. */
  safeMm: number
  cutGuides: boolean
  /** Also keep this format in My formats. */
  savePreset: boolean
}

const SHEET_DEFAULT: Omit<FormatSheet, 'kind'> = {
  sheetWidth: 4,
  sheetHeight: 6,
  columns: 2,
  rows: 2,
  columnGap: 0,
  rowGap: 0,
  margins: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'center'
}

export function initialWizard(): WizardState {
  return {
    step: 'size',
    name: 'Custom format',
    unit: 'in',
    dpi: 300,
    dpiChoice: 300,
    width: 2,
    height: 3,
    mode: 'exact',
    sheet: { ...SHEET_DEFAULT, margins: { ...SHEET_DEFAULT.margins } },
    safe: 'recommended',
    safeMm: RECOMMENDED_SAFE_MARGIN_MM,
    cutGuides: true,
    savePreset: false
  }
}

/** A pixel-entered format has no physical intent: no generic physical safe margin by default. */
const defaultSafeFor = (unit: LengthUnit): SafeMode => (unit === 'px' ? 'none' : 'recommended')

/** Changes the display unit. The stored inches never change (no drift); a pixel format defaults to no safe margin. */
export function setUnit(s: WizardState, unit: LengthUnit): WizardState {
  if (unit === s.unit) return s
  const safe = s.safe === defaultSafeFor(s.unit) ? defaultSafeFor(unit) : s.safe
  return { ...s, unit, safe }
}

/**
 * Changes the resolution. Physical units keep the physical size (the pixels follow). Pixel units keep the entered
 * PIXELS (DPI is then metadata for the physical print size): the design size is rescaled by oldDpi / newDpi. The sheet,
 * gaps and margins are physical paper in every unit (shown in inches for a pixel format), so they never change here.
 */
export function setDpi(
  s: WizardState,
  dpi: number,
  choice: DpiChoice = dpi === 300 || dpi === 600 ? dpi : 'custom'
): WizardState {
  if (!Number.isFinite(dpi) || dpi <= 0 || s.unit !== 'px' || !Number.isFinite(s.dpi) || s.dpi <= 0)
    return { ...s, dpi, dpiChoice: choice }
  const f = s.dpi / dpi
  return {
    ...s,
    dpi,
    dpiChoice: choice,
    width: s.width * f,
    height: s.height * f
  }
}

/** Portrait / landscape toggle: swaps width and height when they disagree with the request (never contradictory). */
export function setOrientation(s: WizardState, want: 'portrait' | 'landscape'): WizardState {
  const o = formatOrientation(s.width, s.height)
  if (o === 'square' || o === want) return s
  return { ...s, width: s.height, height: s.width }
}

export const swapSize = (s: WizardState): WizardState => ({
  ...s,
  width: s.height,
  height: s.width
})

/** Switches the arrangement. "Repeat" uses one gap and one margin; switching to it evens them out. */
export function setMode(s: WizardState, mode: ArrangementMode): WizardState {
  if (mode !== 'repeat') return { ...s, mode }
  const m = s.sheet.margins.top
  return {
    ...s,
    mode,
    sheet: {
      ...s.sheet,
      rowGap: s.sheet.columnGap,
      margins: { top: m, right: m, bottom: m, left: m },
      align: 'center'
    }
  }
}

/** Repeat mode's single gap / single margin. */
export const setRepeatGap = (s: WizardState, gap: number): WizardState => ({
  ...s,
  sheet: { ...s.sheet, columnGap: gap, rowGap: gap }
})
export const setRepeatMargin = (s: WizardState, m: number): WizardState => ({
  ...s,
  sheet: { ...s.sheet, margins: { top: m, right: m, bottom: m, left: m } }
})

export const safeMarginOf = (s: Pick<WizardState, 'safe' | 'safeMm'>): number | null =>
  s.safe === 'none' ? null : s.safe === 'recommended' ? RECOMMENDED_SAFE_MARGIN_MM : s.safeMm

/** The format the wizard currently describes. */
export function wizardFormat(s: WizardState): FormatDefinition {
  return {
    name: s.name,
    width: s.width,
    height: s.height,
    dpi: s.dpi,
    unit: s.unit,
    arrangement:
      s.mode === 'exact'
        ? { kind: 'exact' }
        : { kind: s.mode, ...s.sheet, margins: { ...s.sheet.margins } },
    safeMarginMm: safeMarginOf(s),
    cutGuides: s.cutGuides
  }
}

/** A saved format back into the wizard (My formats → Use). Opens on Review: everything is already chosen. */
export function wizardFrom(f: FormatDefinition, step: WizardStep = 'review'): WizardState {
  const base = initialWizard()
  const a = f.arrangement
  return {
    ...base,
    step,
    name: f.name,
    unit: f.unit,
    dpi: f.dpi,
    dpiChoice: f.dpi === 300 || f.dpi === 600 ? f.dpi : 'custom',
    width: f.width,
    height: f.height,
    mode: a.kind,
    sheet: isSheetArrangement(a)
      ? {
          sheetWidth: a.sheetWidth,
          sheetHeight: a.sheetHeight,
          columns: a.columns,
          rows: a.rows,
          columnGap: a.columnGap,
          rowGap: a.rowGap,
          margins: { ...a.margins },
          align: a.align
        }
      : base.sheet,
    safe:
      f.safeMarginMm === null || f.safeMarginMm === 0
        ? 'none'
        : f.safeMarginMm === RECOMMENDED_SAFE_MARGIN_MM
          ? 'recommended'
          : 'custom',
    safeMm: f.safeMarginMm ?? RECOMMENDED_SAFE_MARGIN_MM,
    cutGuides: f.cutGuides
  }
}

/** Which fields each step owns (a step's problems block Next; every problem blocks Create). */
const STEP_FIELDS: Record<WizardStep, readonly FormatIssue['field'][]> = {
  size: ['width', 'height', 'dpi'],
  output: ['sheetWidth', 'sheetHeight', 'columns', 'rows', 'columnGap', 'rowGap', 'margins', 'fit'],
  safe: ['safeMargin'],
  review: ['name']
}

export function wizardIssues(s: WizardState): FormatIssue[] {
  return validateFormat(wizardFormat(s))
}

export function stepIssues(s: WizardState, step: WizardStep = s.step): FormatIssue[] {
  return wizardIssues(s).filter((i) => STEP_FIELDS[step].includes(i.field))
}

/** The first step (in order) that still has a problem, or null when the format is valid. */
export function firstStepWithIssues(s: WizardState): WizardStep | null {
  const all = wizardIssues(s)
  return WIZARD_STEPS.find((st) => all.some((i) => STEP_FIELDS[st].includes(i.field))) ?? null
}

export function goNext(s: WizardState): WizardState {
  if (stepIssues(s).length > 0) return s
  const i = WIZARD_STEPS.indexOf(s.step)
  return { ...s, step: WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, i + 1)] as WizardStep }
}

export function goBack(s: WizardState): WizardState {
  const i = WIZARD_STEPS.indexOf(s.step)
  return { ...s, step: WIZARD_STEPS[Math.max(0, i - 1)] as WizardStep }
}

/** Parses a number field ("2.25", "2,25", " 50 "); NaN when it is not a number. */
export function parseNumberField(text: string): number {
  const t = text.trim().replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number.NaN
  return Number(t)
}

/** Geometry of the sheet diagram: every copy's rectangle in inches (empty for exact size or an invalid layout). */
export function sheetDiagram(s: WizardState): {
  sheet: { width: number; height: number }
  copies: { x: number; y: number; width: number; height: number }[]
} {
  const sheet =
    s.mode === 'exact'
      ? { width: s.width, height: s.height }
      : { width: s.sheet.sheetWidth, height: s.sheet.sheetHeight }
  if (s.mode === 'exact')
    return { sheet, copies: [{ x: 0, y: 0, width: s.width, height: s.height }] }
  const { columns, rows, columnGap, rowGap, margins, align } = s.sheet
  const nums = [
    columns,
    rows,
    columnGap,
    rowGap,
    margins.top,
    margins.left,
    margins.right,
    margins.bottom,
    sheet.width,
    sheet.height,
    s.width,
    s.height
  ]
  if (!nums.every((n) => Number.isFinite(n)) || columns < 1 || rows < 1 || columns > 8 || rows > 8)
    return { sheet, copies: [] }
  const totalW = columns * s.width + (columns - 1) * columnGap
  const totalH = rows * s.height + (rows - 1) * rowGap
  const areaW = sheet.width - margins.left - margins.right
  const areaH = sheet.height - margins.top - margins.bottom
  const x0 = align === 'start' ? margins.left : margins.left + (areaW - totalW) / 2
  const y0 = align === 'start' ? margins.top : margins.top + (areaH - totalH) / 2
  const copies = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++)
      copies.push({
        x: x0 + c * (s.width + columnGap),
        y: y0 + r * (s.height + rowGap),
        width: s.width,
        height: s.height
      })
  return { sheet, copies }
}

/**
 * B6: the arrangement diagram in words (its text equivalent), e.g. "2 copies across by 2 down on a 4 by 6 in sheet.
 * Top margin 0.5 in, left margin 0.25 in. Placed from the top-left margin." Sheet lengths are physical: shown in mm
 * when the wizard uses mm, otherwise in inches.
 */
export function arrangementInWords(s: WizardState): string {
  if (s.mode === 'exact') return 'Prints one copy at exactly the design size.'
  const { columns, rows, sheetWidth, sheetHeight, margins, columnGap, rowGap, align } = s.sheet
  const unit: LengthUnit = s.unit === 'mm' ? 'mm' : 'in'
  const len = (inches: number): string =>
    `${displayNumber(inches * (unit === 'mm' ? 25.4 : 1), unit)} ${unit}`
  const unitWord = unit === 'mm' ? 'mm' : 'inch'
  const n = (v: number, one: string, many: string): string => `${v} ${v === 1 ? one : many}`
  const parts = [
    `${n(columns, 'copy', 'copies')} across by ${rows} down on a ${displayNumber(sheetWidth * (unit === 'mm' ? 25.4 : 1), unit)} by ${displayNumber(sheetHeight * (unit === 'mm' ? 25.4 : 1), unit)} ${unitWord} sheet.`
  ]
  if (columnGap > 0 || rowGap > 0)
    parts.push(
      columnGap === rowGap
        ? `Gap ${len(columnGap)} between copies.`
        : `Gap across ${len(columnGap)}, gap down ${len(rowGap)}.`
    )
  const sides = (['top', 'right', 'bottom', 'left'] as const).filter((k) => margins[k] > 0)
  if (sides.length > 0)
    parts.push(
      sides.length === 4 && sides.every((k) => margins[k] === margins.top)
        ? `Margin ${len(margins.top)} on every side.`
        : sides
            .map(
              (k, i) =>
                `${i === 0 ? k[0]!.toUpperCase() + k.slice(1) : k} margin ${len(margins[k])}`
            )
            .join(', ') + '.'
    )
  parts.push(align === 'start' ? 'Placed from the top-left margin.' : 'Centred on the sheet.')
  return parts.join(' ')
}
