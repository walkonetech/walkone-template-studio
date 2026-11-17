import {
  createId,
  createProject,
  createSingleOutput,
  createTwoUpStripOutput,
  literalColor,
  MAX_PHYSICAL_SIDE_IN,
  type AssetMediaType,
  type AssetReference,
  type Id,
  type IsoTimestamp,
  type JsonValue,
  type Layer,
  type PrintConfiguration,
  type TemplateProject
} from '@domain'
import { MAX_PHOTO_NUMBER, PREVIEW_PNG, TEMPLATE_XML } from '../../export/dslrbooth/profile'
import {
  plural,
  readDslrTemplate,
  DslrImportError,
  type DslrElementIn,
  type DslrImportItem,
  type DslrImportSeverity,
  type DslrTemplateIn
} from './template'
import { detectTwoUp, type TwoUpDetection } from './twoUp'

/**
 * dslrBooth template → `TemplateProject` (DSLR Booth importer). Pure: the main process supplies the ZIP's entry names,
 * the `template.xml` bytes and facts about each referenced picture; this module decides everything else and returns
 * the project plus which entries to copy in as assets. Mapping rules: docs/DSLRBOOTH_COMPATIBILITY.md §1d.
 */

export const DSLR_ADAPTER_ID = 'dslrbooth'
export const DSLR_IMPORTER_VERSION = '7.48-import-1'

export type DslrImportLayout = 'as-is' | 'strip'

/** What the main process found out about one ZIP entry an `<Image>` refers to. */
export type DslrImageFacts =
  | {
      ok: true
      mediaType: AssetMediaType
      extension: string
      pixelWidth: number
      pixelHeight: number
      hasAlpha?: boolean | undefined
      byteSize: number
      sha256: string
    }
  | { ok: false; message: string }

export interface DslrImportInput {
  /** File name of the ZIP (display and project name fallback). */
  fileName: string
  /** Every file entry in the package, relative to the folder holding `template.xml`. */
  entryNames: readonly string[]
  templateXml: Uint8Array
  /** Facts per entry name, for the entries `referencedEntries()` asked for. */
  images: ReadonlyMap<string, DslrImageFacts>
}

export interface DslrImportSummary {
  templateName: string
  fileName: string
  widthPx: number
  heightPx: number
  dpi: number
  widthIn: number
  heightIn: number
  /** Photo slot elements in the template (copies included). */
  photoSlots: number
  /** Photos per session: distinct photo numbers. */
  photoCount: number
  images: number
  hasPreview: boolean
}

export interface DslrTwoUpInfo {
  stripWidthIn: number
  stripHeightIn: number
  differences: string[]
  crossing: number
}

export interface DslrAssetCopy {
  /** ZIP entry name (relative to the template folder). */
  entry: string
  asset: AssetReference
}

export interface DslrImportResult {
  summary: DslrImportSummary
  /** Present when the sheet holds two matching strips side by side. */
  twoUp: DslrTwoUpInfo | null
  /** The layout used for `project` (the requested one, or the recommended one). */
  layout: DslrImportLayout
  recommendedLayout: DslrImportLayout
  items: DslrImportItem[]
  project: TemplateProject
  assets: DslrAssetCopy[]
}

export interface DslrImportOptions {
  layout?: DslrImportLayout
  now?: IsoTimestamp
  createId?: () => Id
}

const lower = (s: string): string => s.toLowerCase()

/** Matches an `ImagePath` to an entry: exact, then ignoring case (dslrBooth runs on Windows). */
export function resolveEntry(
  imagePath: string,
  entryNames: readonly string[]
): { entry: string; exact: boolean } | null {
  if (imagePath === '') return null
  const wanted = imagePath.replace(/\\/g, '/')
  if (entryNames.includes(wanted)) return { entry: wanted, exact: true }
  const ci = entryNames.find((n) => lower(n) === lower(wanted))
  if (ci) return { entry: ci, exact: false }
  // A path with folders: dslrBooth stores bare names, so try the last segment.
  const base = wanted.split('/').pop() ?? ''
  const byBase = entryNames.find((n) => lower(n) === lower(base))
  return byBase ? { entry: byBase, exact: false } : null
}

/** Entry names whose bytes the main process must inspect (every `<Image>` reference that resolves). */
export function referencedEntries(
  templateXml: Uint8Array,
  entryNames: readonly string[]
): string[] {
  const t = readDslrTemplate(templateXml)
  const out = new Set<string>()
  for (const e of t.elements) {
    if (e.kind !== 'image') continue
    const r = resolveEntry(e.imagePath, entryNames)
    if (r) out.add(r.entry)
  }
  return [...out].sort()
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Display filename for an asset: last path segment, no control characters, ≤ 255 characters. */
function displayName(raw: string, ext: string): string {
  let name = ''
  for (const ch of raw.split(/[\\/]/).pop() ?? '')
    if (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) !== 127) name += ch
  name = name.trim()
  if (name === '' || name === '.' || name === '..') name = `image.${ext}`
  return name.length > 255 ? name.slice(name.length - 255) : name
}

function finiteBox(e: DslrElementIn): boolean {
  return [e.x, e.y, e.width, e.height, e.rotation].every(Number.isFinite)
}

export function mapDslrTemplate(
  input: DslrImportInput,
  options: DslrImportOptions = {}
): DslrImportResult {
  const t: DslrTemplateIn = readDslrTemplate(input.templateXml)
  const now = options.now ?? new Date().toISOString()
  const items: DslrImportItem[] = [...t.items]
  const add = (severity: DslrImportSeverity, code: string, message: string): void => {
    items.push({ severity, code, message })
  }
  const unmapped: JsonValue[] = t.unknown.map((u) => ({ reason: 'unknown-element', ...u }))
  const keep = (reason: string, e: DslrElementIn): void => {
    unmapped.push({
      reason,
      element: e.kind === 'photo' ? 'Photo' : 'Image',
      attributes: e.attributes
    })
  }

  // ---- element validation (geometry, photo numbers, picture files) -------------------------------------------------
  const usable: DslrElementIn[] = []
  const imageFacts = new Map<
    DslrElementIn,
    { entry: string; facts: Extract<DslrImageFacts, { ok: true }> }
  >()
  const badGeometry: string[] = []
  const missing = new Set<string>()
  const unreadable: string[] = []
  const caseOnly = new Set<string>()
  for (const e of t.elements) {
    if (!finiteBox(e) || (e.kind === 'photo' && (e.width <= 0 || e.height <= 0))) {
      badGeometry.push(e.name || e.kind)
      keep('invalid-geometry', e)
      continue
    }
    if (e.width < 0 || e.height < 0) {
      badGeometry.push(e.name || e.kind)
      keep('invalid-geometry', e)
      continue
    }
    if (e.kind === 'photo') {
      if (!Number.isInteger(e.photoNumber) || e.photoNumber < 1) {
        add(
          'warning',
          'photo-number',
          `Photo slot “${e.name || 'unnamed'}” has no valid photo number and was not imported.`
        )
        keep('invalid-photo-number', e)
        continue
      }
      usable.push(e)
      continue
    }
    const r = resolveEntry(e.imagePath, input.entryNames)
    if (!r) {
      missing.add(e.imagePath || '(no file name)')
      keep('missing-image', e)
      continue
    }
    if (!r.exact) caseOnly.add(e.imagePath)
    const facts = input.images.get(r.entry)
    if (!facts || !facts.ok) {
      unreadable.push(`${r.entry}${facts && !facts.ok ? ` (${facts.message})` : ''}`)
      keep('unreadable-image', e)
      continue
    }
    imageFacts.set(e, { entry: r.entry, facts })
    usable.push(e)
  }
  if (badGeometry.length > 0)
    add(
      'warning',
      'invalid-geometry',
      `${plural(badGeometry.length, 'element')} had an unreadable position or size and ${badGeometry.length === 1 ? 'was' : 'were'} not imported: ${badGeometry.join(', ')}.`
    )
  if (missing.size > 0)
    add(
      'warning',
      'missing-image',
      `${plural(missing.size, 'picture')} named in the template ${missing.size === 1 ? 'is' : 'are'} not in the ZIP and ${missing.size === 1 ? 'was' : 'were'} left out: ${[...missing].join(', ')}.`
    )
  if (unreadable.length > 0)
    add(
      'warning',
      'unreadable-image',
      `${plural(unreadable.length, 'picture')} could not be read and ${unreadable.length === 1 ? 'was' : 'were'} left out: ${unreadable.join(', ')}.`
    )
  if (caseOnly.size > 0)
    add(
      'info',
      'image-name-case',
      `${plural(caseOnly.size, 'picture')} matched only when ignoring upper/lower case: ${[...caseOnly].join(', ')}.`
    )

  // ---- stacking order ------------------------------------------------------------------------------------------------
  // dslrBooth draws higher ZIndex in front (fixtures list elements in descending ZIndex). Ties and missing values fall
  // back to file order (later in the file = further back).
  const noZ = usable.filter((e) => !Number.isFinite(e.zIndex)).length
  if (noZ > 0)
    add(
      'warning',
      'z-index',
      `${plural(noZ, 'element')} had no stacking order (ZIndex); ${noZ === 1 ? 'it was' : 'they were'} placed at the back.`
    )
  const zKey = (e: DslrElementIn): number => (Number.isFinite(e.zIndex) ? e.zIndex : -Infinity)
  const zs = usable.map(zKey).filter(Number.isFinite)
  if (new Set(zs).size !== zs.length)
    add(
      'info',
      'z-index-tie',
      'Some elements share a stacking position; file order decided which is in front.'
    )
  const stacked = [...usable].sort((a, b) => zKey(a) - zKey(b) || b.index - a.index)

  // ---- layout (two strips side by side?) ------------------------------------------------------------------------------
  const two: TwoUpDetection | null = detectTwoUp(stacked, t.widthPx, t.heightPx)
  const recommendedLayout: DslrImportLayout =
    two && two.differences.length === 0 ? 'strip' : 'as-is'
  let layout = options.layout ?? recommendedLayout
  if (layout === 'strip' && !two) {
    throw new DslrImportError(
      'This template is not two matching strips side by side, so it cannot be imported as one 2×6 strip.'
    )
  }
  const asStrip = layout === 'strip' && two !== null
  if (!asStrip) layout = 'as-is'

  const designPx = { width: asStrip && two ? two.cellWidth : t.widthPx, height: t.heightPx }
  const print: PrintConfiguration = {
    width: designPx.width / t.dpi,
    height: designPx.height / t.dpi,
    unit: 'in',
    dpi: t.dpi
  }
  const kept = asStrip && two ? stacked.filter((e) => two.left.includes(e)) : stacked
  if (asStrip && two) {
    for (const e of two.right) keep('right-strip-copy', e)
    add(
      'info',
      'two-up',
      `Imported as one ${round2(print.width)} × ${round2(print.height)} in strip. The second strip on the sheet was a copy; Template Studio prints two side by side for you (Print Preview shows the sheet).`
    )
    if (two.maxOffset > 2)
      add(
        'info',
        'two-up-offset',
        `On the original sheet the second strip was placed by hand, up to ${Math.round(two.maxOffset)} px away from an exact copy. Template Studio prints both copies exactly alike.`
      )
    for (const d of two.differences)
      add('warning', 'two-up-difference', `${d} Only the left strip was kept.`)
    if (two.crossing > 0)
      add(
        'info',
        'two-up-crossing',
        `${plural(two.crossing, 'picture')} ${two.crossing === 1 ? 'reaches' : 'reach'} past the strip edge; on the original sheet that part also covered the other strip. Compare with the original preview.`
      )
  } else if (two) {
    add(
      'info',
      'two-up-sheet',
      'The sheet holds two matching strips side by side. It was imported exactly as it is (one 4×6 design); edits to one strip are not copied to the other.'
    )
  }

  // `print_2_per_page="True"` (dslrBooth prints the strip twice on one sheet, runtime findings) = our two-up output.
  const twoPerPageFlag = /^\s*true\s*$/i.test(t.root.print_2_per_page ?? '')
  const twoPerPage =
    twoPerPageFlag &&
    !asStrip &&
    print.height > print.width &&
    print.width * 2 <= MAX_PHYSICAL_SIDE_IN
  if (twoPerPage)
    add(
      'info',
      'print-2-per-page',
      'dslrBooth prints this design two per sheet (“print 2 per page”); Template Studio does the same (see Print Preview).'
    )
  else if (twoPerPageFlag && !asStrip)
    add(
      'warning',
      'print-2-per-page-unsupported',
      '“Print 2 per page” is on, but Template Studio only places two portrait designs side by side; this design prints once.'
    )

  // ---- project ---------------------------------------------------------------------------------------------------------
  const newId = options.createId
  const project = createProject({
    name: (t.name || input.fileName.replace(/\.zip$/i, '') || 'Imported template').slice(0, 200),
    design: print,
    output: asStrip || twoPerPage ? createTwoUpStripOutput(print) : createSingleOutput(print),
    now,
    ...(newId ? { createId: newId } : {})
  })
  const makeId = newId ?? createId
  project.canvas.backgroundColor = literalColor(t.backgroundColor)

  // Assets: one per distinct picture content (the same file is often placed twice).
  const assets: DslrAssetCopy[] = []
  const assetBySha = new Map<string, AssetReference>()
  const assetFor = (
    entry: string,
    facts: Extract<DslrImageFacts, { ok: true }>
  ): AssetReference => {
    const existing = assetBySha.get(facts.sha256)
    if (existing) return existing
    const id = makeId()
    const asset: AssetReference = {
      id,
      filename: displayName(entry, facts.extension),
      mediaType: facts.mediaType,
      path: `assets/${id}.${facts.extension}`,
      pixelWidth: facts.pixelWidth,
      pixelHeight: facts.pixelHeight,
      ...(facts.hasAlpha === undefined ? {} : { hasAlpha: facts.hasAlpha }),
      byteSize: facts.byteSize,
      sha256: facts.sha256,
      source: { kind: 'import', label: 'dslrBooth template' }
    }
    assetBySha.set(facts.sha256, asset)
    assets.push({ entry, asset })
    project.assets.push(asset)
    return asset
  }

  const canvasArea = designPx.width * designPx.height
  const firstPhotoZ = kept.findIndex((e) => e.kind === 'photo')
  const layerData: Record<string, Record<string, JsonValue>> = {}
  let shadows = 0
  let borders = 0
  let photoKeepAspect = 0
  let locked = 0
  let hidden = 0
  kept.forEach((e, z) => {
    const id = makeId()
    const base = {
      id,
      name: e.name || (e.kind === 'photo' ? `Photo ${e.photoNumber}` : 'Picture'),
      x: e.x,
      y: e.y,
      width: e.width,
      height: e.height,
      rotation: e.rotation,
      opacity: e.opacity,
      zIndex: z,
      visible: e.visible,
      locked: e.locked
    }
    if (e.locked) locked++
    if (!e.visible) hidden++
    if (e.shadowEnabled) shadows++
    let layer: Layer
    if (e.kind === 'photo') {
      if (e.keepAspect === false) photoKeepAspect++
      // dslrBooth borders grow OUTWARD from the photo (runtime findings); Template Studio frames sit inside the slot
      // box, so the slot grows by the border on every side. Non-zero borders were never seen in a real file.
      const t2 = e.thickness
      if (t2 > 0) borders++
      layer = {
        ...base,
        ...(t2 > 0
          ? { x: e.x - t2, y: e.y - t2, width: e.width + 2 * t2, height: e.height + 2 * t2 }
          : {}),
        type: 'photo',
        photoNumber: e.photoNumber,
        fit: 'cover',
        frame:
          t2 > 0
            ? {
                style: 'solid',
                thickness: t2,
                color: literalColor(e.strokeColor ?? '#000000')
              }
            : { style: 'none' },
        cornerRadius: 0
      }
    } else {
      const f = imageFacts.get(e)
      if (!f) return
      const asset = assetFor(f.entry, f.facts)
      const large = e.width * e.height >= canvasArea * 0.6
      const below = firstPhotoZ < 0 || z < firstPhotoZ
      layer = {
        ...base,
        type: 'image',
        assetId: asset.id,
        role: large ? (below ? 'background' : 'overlay') : 'graphic',
        // Runtime findings: KeepAspect True = fit inside the box, False = stretch to the box.
        fit: e.keepAspect ? 'contain' : 'stretch'
      }
    }
    project.layers.push(layer)
    if (Object.keys(e.extra).length > 0)
      layerData[id] = { element: e.kind === 'photo' ? 'Photo' : 'Image', attributes: e.extra }
  })
  // Renumber zIndex densely (a skipped image above leaves a gap).
  project.layers.forEach((l, i) => (l.zIndex = i))

  // ---- report ------------------------------------------------------------------------------------------------------------
  const photos = project.layers.flatMap((l) => (l.type === 'photo' ? [l] : []))
  const numbers = [...new Set(photos.map((p) => p.photoNumber))].sort((a, b) => a - b)
  if (photos.length === 0)
    add(
      'warning',
      'no-photo-slots',
      'The template has no photo slots. Add at least one before exporting it back to dslrBooth.'
    )
  const high = numbers.filter((n) => n > MAX_PHOTO_NUMBER)
  if (high.length > 0)
    add(
      'warning',
      'photo-number-range',
      `Photo numbers above ${MAX_PHOTO_NUMBER} (${high.join(', ')}) are not supported by dslrBooth; renumber them before exporting.`
    )
  const gaps = (numbers[numbers.length - 1] ?? 0) - numbers.length
  if (gaps > 0)
    add('info', 'photo-number-gap', `Photo numbers skip some values: ${numbers.join(', ')}.`)
  if (shadows > 0)
    add(
      'warning',
      'shadow',
      `${plural(shadows, 'element')} had a dslrBooth shadow. Template Studio has no shadows yet: the shadow is not shown and is not exported (its settings were kept in the import notes).`
    )
  if (borders > 0)
    add(
      'warning',
      'photo-border',
      `${plural(borders, 'photo slot')} had a border. It became a frame of the same colour, with the slot enlarged so the photo stays where it was. Check it: borders were never seen in a real template file.`
    )
  if (photoKeepAspect > 0)
    add(
      'info',
      'photo-keep-aspect',
      `${plural(photoKeepAspect, 'photo slot')} had “keep aspect” turned off; Template Studio fills slots (the setting was kept in the import notes).`
    )
  if (locked > 0)
    add(
      'info',
      'locked',
      `${plural(locked, 'layer')} ${locked === 1 ? 'was' : 'were'} locked in dslrBooth and ${locked === 1 ? 'stays' : 'stay'} locked. Unlock in the Layers panel to move ${locked === 1 ? 'it' : 'them'}.`
    )
  if (hidden > 0)
    add(
      'info',
      'hidden',
      `${plural(hidden, 'layer')} ${hidden === 1 ? 'is' : 'are'} hidden, as in dslrBooth.`
    )
  if (![300, 600].includes(t.dpi))
    add(
      'info',
      'resolution',
      `The template is ${t.dpi} DPI (real templates seen so far use 300 or 600).`
    )

  const ignorable = (n: string): boolean =>
    n === TEMPLATE_XML ||
    lower(n) === PREVIEW_PNG ||
    /(^|\/)\.DS_Store$/i.test(n) ||
    /(^|\/)Thumbs\.db$/i.test(n)
  // A file only a dropped element referenced is reported with that element, not as "unused".
  const referencedAnywhere = new Set(
    t.elements.flatMap((e) => {
      const r = e.kind === 'image' ? resolveEntry(e.imagePath, input.entryNames) : null
      return r ? [r.entry] : []
    })
  )
  const unused = input.entryNames.filter((n) => !ignorable(n) && !referencedAnywhere.has(n))
  if (unused.length > 0)
    add(
      'info',
      'unused-files',
      `${plural(unused.length, 'file')} in the ZIP ${unused.length === 1 ? 'is' : 'are'} not used by the template and ${unused.length === 1 ? 'was' : 'were'} not carried over: ${unused.join(', ')}.`
    )
  if (t.root.OriginalDevice !== undefined)
    add(
      'info',
      'original-device',
      'The name of the computer that made the template (OriginalDevice) was not kept.'
    )
  add(
    'info',
    'flattened-artwork',
    'Text and decorations come in as the pictures dslrBooth stored (they were already flattened); they can be moved and resized, but not retyped.'
  )

  const rootAttributes: Record<string, string> = { ...t.root }
  delete rootAttributes.OriginalDevice
  project.sourceCompatibility = {
    [DSLR_ADAPTER_ID]: {
      adapterVersion: DSLR_IMPORTER_VERSION,
      importedAt: now,
      project: {
        sourceFile: input.fileName,
        layout,
        rootAttributes,
        rootAttributeOrder: t.rootOrder.filter((k) => k !== 'OriginalDevice'),
        hasBom: t.hasBom
      },
      ...(Object.keys(layerData).length > 0 ? { layers: layerData } : {}),
      ...(unmapped.length > 0 ? { unmapped } : {})
    }
  }

  const severityRank = { error: 0, warning: 1, info: 2 } as const
  items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])

  return {
    summary: {
      templateName: project.metadata.name,
      fileName: input.fileName,
      widthPx: t.widthPx,
      heightPx: t.heightPx,
      dpi: t.dpi,
      widthIn: round2(t.widthPx / t.dpi),
      heightIn: round2(t.heightPx / t.dpi),
      photoSlots: t.elements.filter((e) => e.kind === 'photo').length,
      photoCount: new Set(
        t.elements
          .filter((e) => e.kind === 'photo' && Number.isInteger(e.photoNumber))
          .map((e) => e.photoNumber)
      ).size,
      images: t.elements.filter((e) => e.kind === 'image').length,
      hasPreview: input.entryNames.some((n) => lower(n) === PREVIEW_PNG)
    },
    twoUp: two
      ? {
          stripWidthIn: round2(two.cellWidth / t.dpi),
          stripHeightIn: round2(t.heightPx / t.dpi),
          differences: two.differences,
          crossing: two.crossing
        }
      : null,
    layout,
    recommendedLayout,
    items,
    project,
    assets
  }
}

export { DslrImportError }
export type { DslrImportItem }
