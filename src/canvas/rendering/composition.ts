import {
  checkComposition,
  getPixelSize,
  resolveCompositionCells,
  type CompositionCell,
  type Layer,
  type TemplateProject
} from '@domain'

/**
 * Print composition: how the authored DESIGN is placed onto the print SHEET. Pure (no Konva, no DOM).
 *
 * The project stores ONE authored set of layers. Copies are DERIVED here: each copy is the same layer list
 * translated by its cell origin (`outputX = sourceX + cellX`, same for Y). Width, height, rotation, opacity, role,
 * photoNumber, asset ids, text and group structure are untouched, and the source project is never mutated.
 *
 * Each copy is CLIPPED to its own design cell (ADR-037): off-canvas artwork (e.g. a frame 4 px outside the strip) is
 * cut at the cell edge instead of bleeding into the neighbouring copy. The sheet outside the cells is white.
 */

export interface OutputCopy {
  cell: CompositionCell
  /** The authored layers translated into this copy's position on the sheet (new objects; same ids). */
  layers: Layer[]
}

export interface OutputPlan {
  /** Sheet size in pixels (derived from physical size and DPI). */
  width: number
  height: number
  /** Design size in pixels. */
  design: { width: number; height: number }
  copies: OutputCopy[]
  /** True when the sheet holds more than one copy of the design. */
  composed: boolean
}

/** Does the project print more than one copy of its design per sheet? (Design/Print Preview only matter then.) */
export function hasDerivedCopies(project: TemplateProject): boolean {
  if (project.output.layout.kind === 'single') return false
  return resolveCompositionCells(project.canvas.print, project.output).length > 1
}

export const translateLayers = (layers: readonly Layer[], dx: number, dy: number): Layer[] =>
  layers.map((l) => ({ ...l, x: l.x + dx, y: l.y + dy }) as Layer)

/** Derives the sheet plan. Throws when the stored composition is structurally invalid (design does not fit). */
export function planOutput(project: TemplateProject): OutputPlan {
  const problems = checkComposition(project.canvas.print, project.output)
  if (problems.length > 0) throw new RangeError(problems.map((p) => p.message).join('; '))
  const sheet = getPixelSize(project.output.print)
  const cells = resolveCompositionCells(project.canvas.print, project.output)
  return {
    width: sheet.width,
    height: sheet.height,
    design: getPixelSize(project.canvas.print),
    copies: cells.map((cell) => ({
      cell,
      layers: translateLayers(project.layers, cell.x, cell.y)
    })),
    composed: cells.length > 1
  }
}

export interface CutLine {
  /** Sheet pixel position of the boundary (vertical line when `axis` is 'x'). */
  axis: 'x' | 'y'
  at: number
}

/**
 * Boundaries between adjacent copies (editor-only guide, never artwork). With a gap, the guide sits in the middle of
 * the gap. For a 2-inch strip pair this is the 2-inch centre cut.
 */
export function cutLines(project: TemplateProject): CutLine[] {
  if (project.output.layout.kind === 'single') return []
  const cells = resolveCompositionCells(project.canvas.print, project.output)
  const lines: CutLine[] = []
  const byColumn = cells.filter((c) => c.row === 0)
  for (let i = 1; i < byColumn.length; i++) {
    const prev = byColumn[i - 1] as CompositionCell
    const cur = byColumn[i] as CompositionCell
    lines.push({ axis: 'x', at: (prev.x + prev.width + cur.x) / 2 })
  }
  const byRow = cells.filter((c) => c.column === 0)
  for (let i = 1; i < byRow.length; i++) {
    const prev = byRow[i - 1] as CompositionCell
    const cur = byRow[i] as CompositionCell
    lines.push({ axis: 'y', at: (prev.y + prev.height + cur.y) / 2 })
  }
  return lines
}

/** "2-inch cut" for a 2 in wide strip pair; otherwise a neutral "Cut line". */
export function cutLineLabel(project: TemplateProject): string {
  return project.canvas.print.width === 2 ? '2-inch cut' : 'Cut line'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The part of a rectangle that lies inside a cell (what the clipped copy actually shows), or null if none. */
export function clipToCell(rect: Rect, cell: Rect): Rect | null {
  const left = Math.max(rect.x, cell.x)
  const top = Math.max(rect.y, cell.y)
  const right = Math.min(rect.x + rect.width, cell.x + cell.width)
  const bottom = Math.min(rect.y + rect.height, cell.y + cell.height)
  return right > left && bottom > top
    ? { x: left, y: top, width: right - left, height: bottom - top }
    : null
}
