import { z } from 'zod'
import { NonNegativeNumberSchema } from '../primitives'
import { getPixelSize, PrintConfigurationSchema, type PrintConfiguration } from './print'

/** Sheet margins in inches (Phase 7B B5.5). The copies are laid out inside the sheet minus these margins. */
export const SheetMarginsSchema = z.strictObject({
  top: NonNegativeNumberSchema.max(50),
  right: NonNegativeNumberSchema.max(50),
  bottom: NonNegativeNumberSchema.max(50),
  left: NonNegativeNumberSchema.max(50)
})
export type SheetMargins = z.infer<typeof SheetMarginsSchema>

export const ZERO_MARGINS: Readonly<SheetMargins> = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * How copies of the design canvas are arranged on the output print.
 * - `single`: output is the design itself (same physical size and DPI).
 * - `grid`: `columns × rows` identical copies. `gap` inches between columns (and between rows unless `rowGap` is
 *   set). The block of copies is centred inside the sheet minus `margins` (`align: 'center'`, the default) or starts
 *   at the top-left margin (`align: 'start'`).
 * Copies are not rotated. Arbitrary imposition is intentionally out of scope.
 *
 * `rowGap`, `margins` and `align` are OPTIONAL (Phase 7B B5.5, ADR-059): absent means the pre-B5.5 behaviour (row gap =
 * gap, no margins, centred), so every existing project reads, renders and saves exactly as before. Writers omit them
 * when they equal those defaults (see `normalizeGridLayout`); a file that uses one is written as schemaVersion 2
 * (ADR-060, `fileSchemaVersion`).
 */
export const CompositionLayoutSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('single') }),
  z.strictObject({
    kind: z.literal('grid'),
    columns: z.number().int().min(1).max(8),
    rows: z.number().int().min(1).max(8),
    gap: NonNegativeNumberSchema.max(10),
    rowGap: NonNegativeNumberSchema.max(10).optional(),
    margins: SheetMarginsSchema.optional(),
    align: z.enum(['center', 'start']).optional()
  })
])
export type CompositionLayout = z.infer<typeof CompositionLayoutSchema>
export type GridLayout = Extract<CompositionLayout, { kind: 'grid' }>

export const OutputCompositionSchema = z.strictObject({
  print: PrintConfigurationSchema,
  layout: CompositionLayoutSchema
})
export type OutputComposition = z.infer<typeof OutputCompositionSchema>

/** The effective spacing of a grid (optional fields resolved to their defaults). */
export function gridSpacing(layout: GridLayout): {
  columnGap: number
  rowGap: number
  margins: SheetMargins
  align: 'center' | 'start'
} {
  return {
    columnGap: layout.gap,
    rowGap: layout.rowGap ?? layout.gap,
    margins: layout.margins ?? ZERO_MARGINS,
    align: layout.align ?? 'center'
  }
}

/** Drops optional grid fields that equal their defaults, so a plain grid serializes exactly as it did before B5.5. */
export function normalizeGridLayout(layout: GridLayout): GridLayout {
  const out: GridLayout = {
    kind: 'grid',
    columns: layout.columns,
    rows: layout.rows,
    gap: layout.gap
  }
  if (layout.rowGap !== undefined && layout.rowGap !== layout.gap) out.rowGap = layout.rowGap
  const m = layout.margins
  if (m && (m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0)) out.margins = { ...m }
  if (layout.align === 'start') out.align = 'start'
  return out
}

export interface CompositionCell {
  index: number
  column: number
  row: number
  /** Position of the copy's top-left corner on the output canvas, in output pixels. */
  x: number
  y: number
  width: number
  height: number
}

export interface CompositionProblem {
  message: string
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/** Structural check that the design fits the output; returns problems (empty when valid). */
export function checkComposition(
  design: PrintConfiguration,
  output: OutputComposition
): CompositionProblem[] {
  const problems: CompositionProblem[] = []
  if (design.dpi !== output.print.dpi) {
    problems.push({
      message: `Output DPI (${output.print.dpi}) must equal design DPI (${design.dpi}); rescale the design explicitly instead`
    })
  }
  const eps = 1e-6
  if (output.layout.kind === 'single') {
    if (
      Math.abs(design.width - output.print.width) > eps ||
      Math.abs(design.height - output.print.height) > eps
    ) {
      problems.push({
        message: 'A single-up output must have the same physical size as the design'
      })
    }
    return problems
  }
  const { columns, rows } = output.layout
  const { columnGap, rowGap, margins } = gridSpacing(output.layout)
  const neededW = columns * design.width + (columns - 1) * columnGap
  const neededH = rows * design.height + (rows - 1) * rowGap
  const availW = output.print.width - margins.left - margins.right
  const availH = output.print.height - margins.top - margins.bottom
  const inside = output.layout.margins ? ' inside the margins' : ''
  if (neededW > availW + eps) {
    problems.push({
      message: `${columns} column(s) need ${round3(neededW)} in but output is ${round3(availW)} in wide${inside}`
    })
  }
  if (neededH > availH + eps) {
    problems.push({
      message: `${rows} row(s) need ${round3(neededH)} in but output is ${round3(availH)} in tall${inside}`
    })
  }
  return problems
}

/** Resolves where each design copy lands on the output canvas. Assumes a valid composition. */
export function resolveCompositionCells(
  design: PrintConfiguration,
  output: OutputComposition
): CompositionCell[] {
  const cell = getPixelSize(design)
  if (output.layout.kind === 'single') {
    return [{ index: 0, column: 0, row: 0, x: 0, y: 0, width: cell.width, height: cell.height }]
  }
  const out = getPixelSize(output.print)
  const { columns, rows } = output.layout
  const { columnGap, rowGap, margins, align } = gridSpacing(output.layout)
  const dpi = output.print.dpi
  const gapPx = Math.round(columnGap * dpi)
  const rowGapPx = Math.round(rowGap * dpi)
  const totalW = columns * cell.width + (columns - 1) * gapPx
  const totalH = rows * cell.height + (rows - 1) * rowGapPx
  // Without margins this is exactly the pre-B5.5 formula (centred on the sheet), so existing output is unchanged.
  const left = Math.round(margins.left * dpi)
  const top = Math.round(margins.top * dpi)
  const areaW = out.width - left - Math.round(margins.right * dpi)
  const areaH = out.height - top - Math.round(margins.bottom * dpi)
  const originX = align === 'start' ? left : left + Math.round((areaW - totalW) / 2)
  const originY = align === 'start' ? top : top + Math.round((areaH - totalH) / 2)
  const cells: CompositionCell[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        index: row * columns + column,
        column,
        row,
        x: originX + column * (cell.width + gapPx),
        y: originY + row * (cell.height + rowGapPx),
        width: cell.width,
        height: cell.height
      })
    }
  }
  return cells
}

export function createSingleOutput(design: PrintConfiguration): OutputComposition {
  return { print: { ...design }, layout: { kind: 'single' } }
}

/** Two copies of a strip side by side on a sheet exactly twice as wide (e.g., 2x6 → 4x6). */
export function createTwoUpStripOutput(strip: PrintConfiguration): OutputComposition {
  return {
    print: { ...strip, width: strip.width * 2 },
    layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 }
  }
}
