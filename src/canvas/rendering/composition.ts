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

/**
 * Does the project print on a sheet that differs from its design: several copies per sheet, or (B5.5) a single copy
 * placed on a larger sheet? Design/Print Preview and the separate Design PNG only matter then. Pre-B5.5 projects only
 * have the 2×6 two-up grid, so their answer is unchanged.
 */
export function hasDerivedCopies(project: TemplateProject): boolean {
  if (project.output.layout.kind === 'single') return false
  if (resolveCompositionCells(project.canvas.print, project.output).length > 1) return true
  const d = project.canvas.print
  const s = project.output.print
  return Math.abs(d.width - s.width) > 1e-6 || Math.abs(d.height - s.height) > 1e-6
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
 * Where the copies are cut apart (editor-only guide, never artwork). Copies that touch share one line (for a 2-inch
 * strip pair, the 2-inch centre cut, as before B5.5). With a gap between copies, each copy's own edge is a cut, so the
 * gap is shown as waste between two lines. An outer copy edge that does not lie on the sheet edge (margins, or a block
 * smaller than the sheet) is a cut too. Lines are unique and sorted.
 */
export function cutLines(project: TemplateProject): CutLine[] {
  if (project.output.layout.kind === 'single') return []
  const cells = resolveCompositionCells(project.canvas.print, project.output)
  const sheet = getPixelSize(project.output.print)
  const at = new Map<string, CutLine>()
  const add = (axis: 'x' | 'y', v: number, size: number): void => {
    if (v <= 0.5 || v >= size - 0.5) return // on the sheet edge: nothing to cut
    at.set(`${axis}:${v}`, { axis, at: v })
  }
  const byColumn = cells.filter((c) => c.row === 0)
  byColumn.forEach((cur, i) => {
    const prev = byColumn[i - 1]
    if (!prev) add('x', cur.x, sheet.width)
    else if (prev.x + prev.width === cur.x) add('x', cur.x, sheet.width)
    else {
      add('x', prev.x + prev.width, sheet.width)
      add('x', cur.x, sheet.width)
    }
    if (i === byColumn.length - 1) add('x', cur.x + cur.width, sheet.width)
  })
  const byRow = cells.filter((c) => c.column === 0)
  byRow.forEach((cur, i) => {
    const prev = byRow[i - 1]
    if (!prev) add('y', cur.y, sheet.height)
    else if (prev.y + prev.height === cur.y) add('y', cur.y, sheet.height)
    else {
      add('y', prev.y + prev.height, sheet.height)
      add('y', cur.y, sheet.height)
    }
    if (i === byRow.length - 1) add('y', cur.y + cur.height, sheet.height)
  })
  return [...at.values()].sort((a, b) =>
    a.axis === b.axis ? a.at - b.at : a.axis === 'x' ? -1 : 1
  )
}

/** The sheet's margin box in sheet pixels (editor-only guide), or null when the layout has no margins. */
export function marginBox(project: TemplateProject): Rect | null {
  const layout = project.output.layout
  if (layout.kind !== 'grid' || !layout.margins) return null
  const m = layout.margins
  const dpi = project.output.print.dpi
  const sheet = getPixelSize(project.output.print)
  const left = Math.round(m.left * dpi)
  const top = Math.round(m.top * dpi)
  return {
    x: left,
    y: top,
    width: sheet.width - left - Math.round(m.right * dpi),
    height: sheet.height - top - Math.round(m.bottom * dpi)
  }
}

/** "2-inch cut" for a 2×6 strip pair; otherwise (custom sheets, B5.5) a neutral "Cut line". */
export function cutLineLabel(project: TemplateProject): string {
  const d = project.canvas.print
  return d.width === 2 && d.height === 6 ? '2-inch cut' : 'Cut line'
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
