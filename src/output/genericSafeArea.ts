import {
  getPixelSize,
  resolveCompositionCells,
  type CompositionCell,
  type TemplateProject
} from '@domain'
import type { Rect } from './safeArea'
import { mmToPx } from './units'

/**
 * The GENERIC design safe margin of a format (Phase 7B B5.5, ADR-059): "keep critical content this far from every
 * design edge", chosen in the Custom Size wizard (3 mm recommended). Pure, editor guidance only, never printed.
 *
 * It is deliberately not an Output Profile: it has no trim, no cuts and no evidence of any printer. When a fitting
 * Output Profile is selected, the profile's printer-specific safe areas are used instead (see `checkSafeAreas`).
 */
export interface GenericSafeArea {
  marginMm: number
  marginPx: number
  dpi: number
  /** The keep-safe rectangle on the logical design. */
  design: { width: number; height: number; safeRects: Rect[] }
  /** The keep-safe rectangle of every copy on the print sheet. */
  sheet: { width: number; height: number; safeRects: Rect[] }
  cells: CompositionCell[]
}

const inset = (r: Rect, d: number): Rect | null =>
  r.width > 2 * d && r.height > 2 * d
    ? { x: r.x + d, y: r.y + d, width: r.width - 2 * d, height: r.height - 2 * d }
    : null

/** The project's generic safe margin, or null when it has none (every project before B5.5). */
export function resolveGenericSafeArea(project: TemplateProject): GenericSafeArea | null {
  const mm = project.canvas.safeMarginMm
  if (mm === undefined || !(mm > 0)) return null
  const dpi = project.canvas.print.dpi
  const marginPx = mmToPx(mm, dpi)
  const design = getPixelSize(project.canvas.print)
  const sheet = getPixelSize(project.output.print)
  let cells: CompositionCell[]
  try {
    cells = resolveCompositionCells(project.canvas.print, project.output)
  } catch {
    cells = []
  }
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, width: w, height: h })
  return {
    marginMm: mm,
    marginPx,
    dpi,
    design: {
      ...design,
      safeRects: [inset(rect(0, 0, design.width, design.height), marginPx)].filter(
        (r): r is Rect => r !== null
      )
    },
    sheet: {
      ...sheet,
      safeRects: cells
        .map((c) => inset(rect(c.x, c.y, c.width, c.height), marginPx))
        .filter((r): r is Rect => r !== null)
    },
    cells
  }
}
