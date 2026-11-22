import type { TemplateProject } from '@domain'
import type { ExportOutput } from '@editor/exportPlan'
import { exportFileName, type ExportKind } from '@export/naming'
import { isNativeStrip, mainVariant, planDslrTemplate, type DslrVariant } from './plan'
import { dslrSupport } from './compat'

/**
 * The dslrBooth outputs a project offers (Phase 6B), shown above the vendor-neutral files in the Export dialog.
 *  - every project: `dslrbooth`, the main template (native 2×6 strip, the 4×6 sheet, or a single-up design);
 *  - a native 2×6 strip also offers `dslrbooth-4x6`: both strips pre-placed on one 4×6 sheet, the way templates are
 *    built by hand in dslrBooth today (compatibility fallback while the native strip is validated, Phase 6C).
 */

export const isDslrKind = (k: ExportKind): k is 'dslrbooth' | 'dslrbooth-4x6' =>
  k === 'dslrbooth' || k === 'dslrbooth-4x6'

export const dslrVariantFor = (
  project: TemplateProject,
  kind: 'dslrbooth' | 'dslrbooth-4x6'
): DslrVariant => (kind === 'dslrbooth-4x6' ? 'sheet' : mainVariant(project))

/** The template `Name`: the ZIP file name without `.zip` (equal, as in every real export). */
export const dslrTemplateNameFor = (fileName: string): string => fileName.replace(/\.zip$/i, '')

const LABEL: Record<DslrVariant, string> = {
  strip: 'dslrBooth template · 2×6 strip',
  sheet: 'dslrBooth template · full sheet',
  single: 'dslrBooth template'
}

export function dslrOutputs(project: TemplateProject): ExportOutput[] {
  // Custom sizes never shown to work in dslrBooth are not offered (B5.5); the Checks say why.
  if (!dslrSupport(project).supported) return []
  const out: ExportOutput[] = []
  const make = (
    kind: 'dslrbooth' | 'dslrbooth-4x6',
    description: string,
    selected: boolean,
    label?: string
  ): void => {
    const variant = dslrVariantFor(project, kind)
    const plan = planDslrTemplate(project, variant)
    const print = variant === 'sheet' ? project.output.print : project.canvas.print
    out.push({
      kind,
      label: label ?? LABEL[variant],
      description,
      fileName: exportFileName(project.metadata.name, kind),
      width: plan.canvas.width,
      height: plan.canvas.height,
      dpi: plan.canvas.dpi,
      widthIn: print.width,
      heightIn: print.height,
      production: true,
      defaultSelected: selected
    })
  }
  const variant = mainVariant(project)
  make(
    'dslrbooth',
    variant === 'strip'
      ? 'Import into dslrBooth 7.48. One strip; dslrBooth prints two side by side on the 4×6 sheet.'
      : 'Import into dslrBooth 7.48: photo slots plus your artwork, ready for the booth.',
    true
  )
  if (isNativeStrip(project))
    make(
      'dslrbooth-4x6',
      'Both strips already placed on one 4×6, like templates built by hand in dslrBooth. Use it if the strip version does not print as expected.',
      false,
      'dslrBooth template · 4×6 sheet'
    )
  return out
}
