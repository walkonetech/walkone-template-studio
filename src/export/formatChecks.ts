import { getPixelSize, resolveCompositionCells, type TemplateProject } from '@domain'
import type { CheckInput } from '@editor/checks'
import { dslrSupport } from './dslrbooth/compat'

/**
 * Format notes for the Checks (Phase 7B B5.5), in the ONE Checks model (`@editor/checks`). Custom formats get "Good to
 * know" notes: what the format is, that no printer profile is needed for PNG files, and why there is no dslrBooth
 * template for an untested size. None of these is an error: a custom PNG-only workflow is complete without a printer
 * profile. Structural problems (copies that do not fit the sheet) are already errors in the export preflight
 * (`composition-invalid`), and an invalid format can never be created (the wizard and main both validate it).
 */

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const inches = (n: number): string => String(Math.round(n * 1000) / 1000)

/** A project made from a built-in format (2×6 two-up, 4×6, 6×4) or imported from dslrBooth: not a custom format. */
export function isCustomFormat(project: TemplateProject): boolean {
  if (project.sourceCompatibility?.['dslrbooth'] !== undefined) return false
  if (project.canvas.safeMarginMm !== undefined) return true
  const d = project.canvas.print
  const o = project.output
  const is = (w: number, h: number): boolean => near(d.width, w) && near(d.height, h)
  if (o.layout.kind === 'single') return !(is(4, 6) || is(6, 4))
  const plainTwoUp =
    is(2, 6) &&
    o.layout.columns === 2 &&
    o.layout.rows === 1 &&
    o.layout.gap === 0 &&
    o.layout.rowGap === undefined &&
    o.layout.margins === undefined &&
    o.layout.align === undefined &&
    near(o.print.width, 4) &&
    near(o.print.height, 6)
  return !plainTwoUp
}

/** "2.25×3.25 in design (675×975 px @ 300 DPI) · 4 copies on a 4×6 in sheet (2 across × 2 down)". */
export function describeProjectFormat(project: TemplateProject): string {
  const d = project.canvas.print
  const px = getPixelSize(d)
  const design = `${inches(d.width)}×${inches(d.height)} in design (${px.width}×${px.height} px @ ${d.dpi} DPI)`
  const o = project.output
  if (o.layout.kind === 'single') return `${design}, printed at exactly this size`
  let n: number
  try {
    n = resolveCompositionCells(d, o).length
  } catch {
    n = o.layout.columns * o.layout.rows
  }
  return `${design}, ${n} ${n === 1 ? 'copy' : 'copies'} on a ${inches(o.print.width)}×${inches(o.print.height)} in sheet (${o.layout.columns} across × ${o.layout.rows} down)`
}

export function formatCheckItems(
  project: TemplateProject,
  env: { hasOutputProfile: boolean }
): CheckInput[] {
  if (!isCustomFormat(project)) return []
  const items: CheckInput[] = [
    {
      code: 'format-custom',
      severity: 'info',
      message: `Custom format: ${describeProjectFormat(project)}.`
    }
  ]
  if (!env.hasOutputProfile)
    items.push({
      code: 'format-no-printer',
      severity: 'info',
      message:
        'No printer profile is assigned. That is fine for PNG files; printer-specific safe areas are only checked when a matching printer profile is chosen in View › Printer & cutting….'
    })
  const dslr = dslrSupport(project)
  if (!dslr.supported)
    items.push({ code: 'format-dslr-unsupported', severity: 'info', message: dslr.reason })
  return items
}
