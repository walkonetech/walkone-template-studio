import type { TemplateProject } from '@domain'
import { printableLeaves } from '@editor/exportPlan'
import type { PreflightSeverity } from '@editor/exportPreflight'
import { KNOWN_RESOLUTIONS, MAX_PHOTO_NUMBER } from './profile'
import { isNativeStrip, mainVariant, planDslrTemplate } from './plan'

/**
 * dslrBooth 7.48 checks (Phase 6B). Run IN ADDITION to the vendor-neutral export preflight (6A) when a dslrBooth output
 * is selected; same severities (error blocks the dslrBooth output, warning allows it, info is just worth knowing).
 */

export type DslrPreflightCode =
  | 'dslr-no-photo-slots'
  | 'dslr-photo-number-range'
  | 'dslr-photo-fit'
  | 'dslr-photo-opacity'
  | 'dslr-photo-rotation'
  | 'dslr-resolution'
  | 'dslr-flattened'
  | 'dslr-two-up'

export interface DslrPreflightItem {
  code: DslrPreflightCode
  severity: PreflightSeverity
  message: string
  layerIds: string[]
}

export interface DslrPreflight {
  items: DslrPreflightItem[]
  errors: number
  canExport: boolean
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function runDslrPreflight(project: TemplateProject): DslrPreflight {
  const items: DslrPreflightItem[] = []
  const add = (
    code: DslrPreflightCode,
    severity: PreflightSeverity,
    message: string,
    layerIds: string[] = []
  ): void => {
    items.push({ code, severity, message, layerIds })
  }
  const leaves = printableLeaves(project)
  const photos = leaves.flatMap((l) => (l.type === 'photo' ? [l] : []))

  // ADR-045: the template defines how many photos the booth takes; it needs at least one.
  if (photos.length === 0)
    add(
      'dslr-no-photo-slots',
      'error',
      'A dslrBooth template needs at least one photo slot. The booth takes as many photos as the template has slots.'
    )
  const outOfRange = photos.filter((p) => p.photoNumber > MAX_PHOTO_NUMBER)
  if (outOfRange.length > 0)
    add(
      'dslr-photo-number-range',
      'error',
      `dslrBooth supports photo numbers 1–${MAX_PHOTO_NUMBER}. ${plural(outOfRange.length, 'slot')} use a higher number.`,
      outOfRange.map((p) => p.id)
    )
  const notCover = photos.filter((p) => p.fit !== 'cover')
  if (notCover.length > 0)
    add(
      'dslr-photo-fit',
      'warning',
      `dslrBooth always fills a photo slot (crops to fill). ${plural(notCover.length, 'slot')} set to “Fit” or “Stretch” will be filled instead.`,
      notCover.map((p) => p.id)
    )
  const faded = photos.filter((p) => p.opacity < 1)
  if (faded.length > 0)
    add(
      'dslr-photo-opacity',
      'warning',
      `Photo transparency is not exported: ${plural(faded.length, 'slot')} will show the photo fully opaque.`,
      faded.map((p) => p.id)
    )
  const rotated = photos.filter((p) => p.rotation % 360 !== 0)
  if (rotated.length > 0) {
    const fractional = rotated.some((p) => Math.abs(p.rotation - Math.round(p.rotation)) > 0.01)
    add(
      'dslr-photo-rotation',
      'info',
      `${plural(rotated.length, 'photo slot')} ${rotated.length === 1 ? 'is' : 'are'} rotated. dslrBooth rotates the photo clockwise around the slot centre${fractional ? '; angles are rounded to whole degrees' : ''}.`,
      rotated.map((p) => p.id)
    )
  }
  const dpi = project.canvas.print.dpi
  if (!(KNOWN_RESOLUTIONS as readonly number[]).includes(dpi))
    add(
      'dslr-resolution',
      'warning',
      `The design is ${dpi} DPI. Real dslrBooth templates use 300 or 600 DPI; this one has not been tested.`
    )
  if (photos.length > 0) {
    const plan = planDslrTemplate(project, mainVariant(project))
    const images = plan.items.filter((i) => i.kind === 'image').length
    add(
      'dslr-flattened',
      'info',
      `Artwork and text are combined into ${plural(images, 'image')} around the photo slots, so the booth computer needs none of your fonts. Make changes here, then export again.`
    )
  }
  if (isNativeStrip(project))
    add(
      'dslr-two-up',
      'info',
      'This exports one 2×6 strip; dslrBooth prints two side by side on the 4×6 sheet (“print 2 per page”). If your booth prints it differently, use the 4×6 sheet version instead.'
    )
  const errors = items.filter((i) => i.severity === 'error').length
  return { items, errors, canExport: errors === 0 }
}
