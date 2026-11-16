import {
  checkComposition,
  effectiveResolution,
  getPixelSize,
  isEffectivelyVisible,
  type Layer,
  type TemplateProject
} from '@domain'
import { boundsOf } from './mutations'
import { fontInventory, type FontEnvironment } from './fonts'
import { brokenPaletteReferences } from './paletteMutations'
import { printableLeaves } from './exportPlan'

/**
 * Export preflight (Phase 6A). Pure checks run before rendering, vendor-neutral. Severity:
 *   error   - the export would be wrong or impossible: export is blocked until fixed
 *   warning - the export works but probably not as intended: shown prominently, export allowed
 *   info    - worth knowing, nothing to fix
 * DSLR Booth limits (e.g. PhotoNumber 1-12) are NOT checked here; they belong to the DSLR Booth adapter (Phase 6B).
 * Repeated photo numbers are valid (duplicated strips repeat them) and are never reported.
 */

export type PreflightSeverity = 'error' | 'warning' | 'info'

export type PreflightCode =
  | 'composition-invalid'
  | 'asset-missing'
  | 'asset-unreadable'
  | 'palette-broken'
  | 'photo-number-invalid'
  | 'photo-number-gap'
  | 'no-photo-slots'
  | 'photo-slot-outside'
  | 'font-missing'
  | 'font-unknown'
  | 'image-low-resolution'
  | 'image-soft-resolution'
  | 'artwork-clipped'
  | 'artwork-off-canvas'
  | 'hidden-layers'

export interface PreflightItem {
  code: PreflightCode
  severity: PreflightSeverity
  message: string
  layerIds: string[]
}

export interface ExportPreflight {
  items: PreflightItem[]
  errors: number
  warnings: number
  infos: number
  /** False while any error remains. */
  canExport: boolean
}

export interface PreflightEnv {
  fonts: FontEnvironment
  /** Asset ids whose images could not be loaded on this computer (decode/read failure), if known. */
  unreadableAssetIds?: readonly string[]
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const names = (layers: readonly Layer[], max = 3): string => {
  const shown = layers.slice(0, max).map((l) => `“${l.name || l.type}”`)
  return layers.length > max
    ? `${shown.join(', ')} and ${layers.length - max} more`
    : shown.join(', ')
}

/** Missing photo numbers between 1 and the highest number used (e.g. [2] for 1, 3). */
export function photoNumberGaps(numbers: readonly number[]): number[] {
  const valid = numbers.filter((n) => Number.isInteger(n) && n > 0)
  if (valid.length === 0) return []
  const set = new Set(valid)
  const max = Math.max(...valid)
  const gaps: number[] = []
  for (let n = 1; n < max; n++) if (!set.has(n)) gaps.push(n)
  return gaps
}

export function runExportPreflight(project: TemplateProject, env: PreflightEnv): ExportPreflight {
  const items: PreflightItem[] = []
  const add = (
    code: PreflightCode,
    severity: PreflightSeverity,
    message: string,
    layers: readonly Layer[] = []
  ): void => {
    items.push({ code, severity, message, layerIds: layers.map((l) => l.id) })
  }

  // Composition: the print sheet must be derivable from the design.
  const problems = checkComposition(project.canvas.print, project.output)
  if (problems.length > 0) {
    add(
      'composition-invalid',
      'error',
      `The print layout is not valid: ${problems.map((p) => p.message).join('; ')}.`
    )
  }

  const leaves = printableLeaves(project)
  const assetIds = new Set(project.assets.map((a) => a.id))

  // Assets
  const missing = leaves.filter((l) => l.type === 'image' && !assetIds.has(l.assetId))
  if (missing.length > 0) {
    add(
      'asset-missing',
      'error',
      `${plural(missing.length, 'image layer')} refer to an image that is not in the project: ${names(missing)}.`,
      missing
    )
  }
  const unreadable = new Set(env.unreadableAssetIds ?? [])
  const broken = leaves.filter(
    (l) => l.type === 'image' && assetIds.has(l.assetId) && unreadable.has(l.assetId)
  )
  if (broken.length > 0) {
    add(
      'asset-unreadable',
      'error',
      `${plural(broken.length, 'image')} could not be loaded: ${names(broken)}. Replace or remove them.`,
      broken
    )
  }

  // Palette: a broken reference would print the magenta "missing colour" marker.
  const brokenRefs = brokenPaletteReferences(project)
  if (brokenRefs.length > 0) {
    const layers = brokenRefs.flatMap((r) => project.layers.filter((l) => l.id === r.ref.layerId))
    add(
      'palette-broken',
      'error',
      `${plural(brokenRefs.length, 'colour')} refer to a palette colour that no longer exists and would print as magenta. Choose a colour for them.`,
      layers
    )
  }

  // Photo slots
  const photos = leaves.filter((l) => l.type === 'photo')
  if (photos.length === 0) {
    add(
      'no-photo-slots',
      'warning',
      'The design has no visible photo slots, so no booth photos will appear in it.'
    )
  }
  const invalidNumbers = photos.filter((p) => !Number.isInteger(p.photoNumber) || p.photoNumber < 1)
  if (invalidNumbers.length > 0) {
    add(
      'photo-number-invalid',
      'error',
      `${plural(invalidNumbers.length, 'photo slot')} have an invalid photo number: ${names(invalidNumbers)}.`,
      invalidNumbers
    )
  }
  const gaps = photoNumberGaps(photos.map((p) => p.photoNumber))
  if (gaps.length > 0) {
    add(
      'photo-number-gap',
      'info',
      `Photo numbers skip ${gaps.join(', ')}. That is fine if intended (for example when another layout uses them).`
    )
  }

  // Geometry against the artboard
  const design = getPixelSize(project.canvas.print)
  const clipped: Layer[] = []
  const outside: Layer[] = []
  const slotOutside: Layer[] = []
  for (const l of leaves) {
    const b = boundsOf(l)
    const off = b.right <= 0 || b.bottom <= 0 || b.left >= design.width || b.top >= design.height
    const partly =
      !off &&
      (b.left < -0.5 ||
        b.top < -0.5 ||
        b.right > design.width + 0.5 ||
        b.bottom > design.height + 0.5)
    if (l.type === 'photo') {
      if (off || partly) slotOutside.push(l)
    } else if (off) outside.push(l)
    else if (partly) clipped.push(l)
  }
  if (slotOutside.length > 0) {
    add(
      'photo-slot-outside',
      'warning',
      `${plural(slotOutside.length, 'photo slot')} extend past the edge of the design: ${names(slotOutside)}.`,
      slotOutside
    )
  }
  if (outside.length > 0) {
    add(
      'artwork-off-canvas',
      'warning',
      `${plural(outside.length, 'layer')} lie entirely outside the design and will not appear: ${names(outside)}.`,
      outside
    )
  }
  if (clipped.length > 0) {
    add(
      'artwork-clipped',
      'info',
      `${plural(clipped.length, 'layer')} extend past the edge and will be cut at the design edge: ${names(clipped)}.`,
      clipped
    )
  }

  // Fonts (only text that is actually printed)
  const inv = fontInventory({ ...project, layers: leaves }, env.fonts)
  const byId = new Map(project.layers.map((l) => [l.id, l]))
  for (const f of inv.entries) {
    const layers = f.layerIds.map((id) => byId.get(id)).filter((l): l is Layer => l !== undefined)
    if (f.availability === 'missing') {
      add(
        'font-missing',
        'warning',
        `Font “${f.family}” is not installed on this computer; text using it will be exported in a fallback font.`,
        layers
      )
    } else if (f.availability === 'unknown') {
      add(
        'font-unknown',
        'info',
        `Could not confirm that font “${f.family}” is installed; check the text in the exported files.`,
        layers
      )
    }
  }

  // Image resolution (as placed)
  const low: Layer[] = []
  const soft: Layer[] = []
  for (const l of leaves) {
    if (l.type !== 'image') continue
    const asset = project.assets.find((a) => a.id === l.assetId)
    if (!asset) continue
    const r = effectiveResolution(asset, l, project.canvas.print.dpi, l.fit)
    if (r?.status === 'low') low.push(l)
    else if (r?.status === 'caution') soft.push(l)
  }
  if (low.length > 0) {
    add(
      'image-low-resolution',
      'warning',
      `${plural(low.length, 'image')} will print below 150 DPI and may look blurry: ${names(low)}.`,
      low
    )
  }
  if (soft.length > 0) {
    add(
      'image-soft-resolution',
      'info',
      `${plural(soft.length, 'image')} will print between 150 and 300 DPI: ${names(soft)}.`,
      soft
    )
  }

  // Hidden layers are not exported.
  const hidden = project.layers.filter(
    (l) => l.type !== 'group' && !isEffectivelyVisible(project.layers, l)
  )
  if (hidden.length > 0) {
    add(
      'hidden-layers',
      'info',
      `${plural(hidden.length, 'hidden layer')} will not be exported.`,
      hidden
    )
  }

  const order: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 }
  items.sort((a, b) => order[a.severity] - order[b.severity])
  const errors = items.filter((i) => i.severity === 'error').length
  const warnings = items.filter((i) => i.severity === 'warning').length
  return {
    items,
    errors,
    warnings,
    infos: items.length - errors - warnings,
    canExport: errors === 0
  }
}
