import { z } from 'zod'
import { NonNegativeNumberSchema } from '../primitives'
import { getPixelSize, PrintConfigurationSchema, type PrintConfiguration } from './print'

/**
 * How copies of the design canvas are arranged on the output print.
 * - `single`: output is the design itself (same physical size and DPI).
 * - `grid`: `columns × rows` identical copies, separated by `gap` inches and centered on the output.
 * Copies are not rotated. Arbitrary imposition is intentionally out of scope.
 */
export const CompositionLayoutSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('single') }),
  z.strictObject({
    kind: z.literal('grid'),
    columns: z.number().int().min(1).max(8),
    rows: z.number().int().min(1).max(8),
    gap: NonNegativeNumberSchema.max(10)
  })
])
export type CompositionLayout = z.infer<typeof CompositionLayoutSchema>

export const OutputCompositionSchema = z.strictObject({
  print: PrintConfigurationSchema,
  layout: CompositionLayoutSchema
})
export type OutputComposition = z.infer<typeof OutputCompositionSchema>

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
  const { columns, rows, gap } = output.layout
  const neededW = columns * design.width + (columns - 1) * gap
  const neededH = rows * design.height + (rows - 1) * gap
  if (neededW > output.print.width + eps) {
    problems.push({
      message: `${columns} column(s) need ${neededW} in but output is ${output.print.width} in wide`
    })
  }
  if (neededH > output.print.height + eps) {
    problems.push({
      message: `${rows} row(s) need ${neededH} in but output is ${output.print.height} in tall`
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
  const { columns, rows, gap } = output.layout
  const gapPx = Math.round(gap * output.print.dpi)
  const totalW = columns * cell.width + (columns - 1) * gapPx
  const totalH = rows * cell.height + (rows - 1) * gapPx
  const originX = Math.round((out.width - totalW) / 2)
  const originY = Math.round((out.height - totalH) / 2)
  const cells: CompositionCell[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      cells.push({
        index: row * columns + column,
        column,
        row,
        x: originX + column * (cell.width + gapPx),
        y: originY + row * (cell.height + gapPx),
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
