import {
  getOrientation,
  getPixelSize,
  resolveCompositionCells,
  type PrintConfiguration,
  type TemplateProject
} from '@domain'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { formatNumber } from './numberInput'

/** e.g. "4×6 Portrait • 600 DPI • 2400×3600 px" (status bar and project summary). */
export function describePrint(print: PrintConfiguration): string {
  const px = getPixelSize(print)
  const orientation = getOrientation(print)
  const label =
    orientation === 'portrait' ? 'Portrait' : orientation === 'landscape' ? 'Landscape' : 'Square'
  return `${formatNumber(print.width)}×${formatNumber(print.height)} ${label} • ${print.dpi} DPI • ${px.width}×${px.height} px`
}

/** "2×6 Strip" for the strip size, else "4×6". */
export const printSizeName = (print: PrintConfiguration): string =>
  `${formatNumber(print.width)}×${formatNumber(print.height)}${print.width === 2 && print.height === 6 ? ' Strip' : ''}`

/** Several copies of the design per sheet (a Design / Print Preview distinction exists). */
export const copiesPerSheet = (project: TemplateProject): number =>
  project.output.layout.kind === 'single'
    ? 1
    : resolveCompositionCells(project.canvas.print, project.output).length

/**
 * Status-bar text. Ordinary projects: "4×6 Portrait • 600 DPI • 2400×3600 px". Strip projects keep the design and the
 * sheet apart: Design → "2×6 Strip • 600 DPI • Design 1200×3600 px"; Print Preview → "4×6 Output • 2-up • 2400×3600 px".
 */
export function describeWorkspace(project: TemplateProject, mode: 'design' | 'preview'): string {
  const copies = copiesPerSheet(project)
  // B5.5: one copy placed on a larger sheet still has a separate print sheet.
  if (copies <= 1 && !hasDerivedCopies(project)) return describePrint(project.canvas.print)
  if (mode === 'preview') {
    const px = getPixelSize(project.output.print)
    return `${formatNumber(project.output.print.width)}×${formatNumber(project.output.print.height)} Output • ${copies}-up • ${px.width}×${px.height} px`
  }
  const px = getPixelSize(project.canvas.print)
  return `${printSizeName(project.canvas.print)} • ${project.canvas.print.dpi} DPI • Design ${px.width}×${px.height} px`
}

/**
 * B6: the canvas's text equivalent for assistive technology (its accessible description). The canvas pixels are not
 * individually exposed; this says which design is in the workspace, how it prints and what is selected. Layers and
 * Properties remain the accessible way to reach each layer.
 */
export function describeCanvasForScreenReader(
  project: TemplateProject,
  mode: 'design' | 'preview',
  selected: readonly { name: string; type: string }[]
): string {
  const parts = [
    mode === 'preview' ? 'Print Preview, read only' : 'Design',
    describeWorkspace(project, mode).replace(/ • /g, ', ')
  ]
  const copies = copiesPerSheet(project)
  if (copies > 1) parts.push(`${copies} copies per sheet`)
  const count = project.layers.length
  parts.push(count === 1 ? '1 layer' : `${count} layers`)
  if (mode === 'design') {
    if (selected.length === 0) parts.push('Nothing selected')
    else if (selected.length === 1)
      parts.push(`Selected: ${selected[0]!.type} “${selected[0]!.name}”`)
    else parts.push(`${selected.length} layers selected`)
    parts.push('Use the Layers panel to choose a layer and Properties to change it')
  }
  return parts.join('. ') + '.'
}
