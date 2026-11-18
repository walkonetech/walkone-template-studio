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
  type TemplateProject,
  type TextLayer
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
import {
  AUTO_EM_PER_BOX_HEIGHT,
  estimateWidthEm,
  fitMargin,
  overflowRatio,
  estimateWrappedLines,
  parseDslrWeight
} from './textFit'
import { detectTwoUp, type TwoUpDetection } from './twoUp'

/**
 * dslrBooth template → `TemplateProject` (DSLR Booth importer). Pure: the main process supplies the ZIP's entry names,
 * the `template.xml` bytes and facts about each referenced picture; this module decides everything else and returns
 * the project plus which entries to copy in as assets. Mapping rules: docs/DSLRBOOTH_COMPATIBILITY.md §1d.
 */

export const DSLR_ADAPTER_ID = 'dslrbooth'
export const DSLR_IMPORTER_VERSION = '7.48-import-3'

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

const tagOf = (e: DslrElementIn): string =>
  e.kind === 'photo' ? 'Photo' : e.kind === 'text' ? 'Text' : 'Image'

const quote = (s: string): string => {
  const one = s.replace(/\s+/g, ' ').trim()
  return `“${one.length > 40 ? `${one.slice(0, 40)}…` : one}”`
}

/** How an element is named in the import notes. */
const elementLabel = (e: DslrElementIn): string =>
  e.kind === 'photo'
    ? `photo slot ${e.photoNumber}`
    : e.kind === 'text'
      ? `text ${quote(e.text?.content ?? e.name)}`
      : quote(e.name || e.imagePath)

/** Whether two boxes overlap (unrotated boxes: an estimate for the import notes). */
const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** What importing one live `<Text>` produced besides the layer, for the import notes. */
interface TextNotes {
  auto: boolean
  widened: boolean
  overflow: boolean
  /** Estimated wrapped lines when `overflow` (Template Studio wraps what dslrBooth cuts off). */
  overflowLines: number
  lineBreaks: boolean
  stretch: string[]
  unknownWeight: string | null
  badAlign: string | null
  badColor: string | null
  badSize: string | null
  noFont: boolean
  boldItalicAsItalic: boolean
}

/** dslrBooth's default text font (its Font list starts on Arial; observed). */
const DSLR_DEFAULT_FONT = 'Arial'

/**
 * A live `<Text>` → the fields of an editable text layer (6C C1; mapping table in docs/DSLRBOOTH_COMPATIBILITY.md §1d).
 * Geometry is the dslrBooth box, except that a single line dslrBooth sized to fit gets a little extra width (anchored by
 * its alignment, so the text does not move) because Template Studio wraps a line that is even slightly too wide.
 */
function mapText(e: DslrElementIn & { text: NonNullable<DslrElementIn['text']> }): {
  fields: Record<string, unknown>
  box: { x: number; y: number; width: number }
  notes: TextNotes
} {
  const t = e.text
  const notes: TextNotes = {
    auto: false,
    widened: false,
    overflow: false,
    overflowLines: 1,
    lineBreaks: /[\r\n]/.test(t.content),
    stretch: [],
    unknownWeight: null,
    badAlign: null,
    badColor: null,
    badSize: null,
    noFont: t.fontName === '',
    boldItalicAsItalic: false
  }
  const fontFamily = (t.fontName || DSLR_DEFAULT_FONT).slice(0, 200)
  const w = parseDslrWeight(t.fontWeight)
  notes.stretch = w.unsupported
  if (w.unknown.length > 0) notes.unknownWeight = t.fontWeight
  // dslrBooth 7.48 offers "Bold Italic" but draws it as plain Italic: in its editor, its preview.png and a live session
  // (observed, fixture T4, Arial). Import what it prints; the style name stays in the import notes.
  notes.boldItalicAsItalic = w.weight === 700 && w.italic && !t.isBold
  // The legacy flags are honoured if a file sets them (7.48's editor never does: observed always False).
  const fontWeight = t.isBold ? Math.max(w.weight, 700) : notes.boldItalicAsItalic ? 400 : w.weight
  const italic = w.italic || t.isItalic
  // TextHorizontalAlignment: observed 0 left, 1 centre, 2 right. dslrBooth's default for new text is centre.
  const align = t.alignment === 0 ? 'left' : t.alignment === 2 ? 'right' : 'center'
  if (![0, 1, 2].includes(t.alignment))
    notes.badAlign = e.attributes.TextHorizontalAlignment ?? '(none)'
  if (t.color === null && t.colorRaw !== undefined) notes.badColor = t.colorRaw
  const fill = t.color ?? '#000000'

  const emWidth = Math.max(estimateWidthEm(t.content, fontWeight >= 600), 0.01)
  const margin = fitMargin(fontFamily)
  let fontSize: number
  if (Number.isFinite(t.fontSize) && t.fontSize > 0) fontSize = t.fontSize
  else {
    // FontSize 0 = "Auto" (observed). Absent/unreadable sizes are treated the same way, with their own note.
    if (t.fontSize !== 0) notes.badSize = e.attributes.FontSize ?? '(none)'
    notes.auto = t.fontSize === 0
    const byHeight = e.height * AUTO_EM_PER_BOX_HEIGHT
    const byWidth = e.width / (emWidth * margin)
    fontSize = Math.max(1, Math.floor(Math.min(byHeight, byWidth) * 10) / 10)
  }

  let { x, y, width } = e
  // An approximated size was already chosen to fit the box, so only a stored size can need a wider box.
  if (!notes.lineBreaks && !notes.auto && notes.badSize === null) {
    const estimated = emWidth * fontSize
    const need = Math.ceil(estimated * margin + 2)
    if (estimated > width * overflowRatio(fontFamily)) {
      notes.overflow = true
      notes.overflowLines = estimateWrappedLines(t.content, fontWeight >= 600, width / fontSize)
    } else if (need > width) {
      // Grow the box without moving the text: keep the aligned edge (or the centre) where it was, also when rotated.
      const d = need - width
      const shift = align === 'left' ? d / 2 : align === 'right' ? -d / 2 : 0
      const r = (e.rotation * Math.PI) / 180
      const cx = e.x + e.width / 2 + shift * Math.cos(r)
      const cy = e.y + e.height / 2 + shift * Math.sin(r)
      width = need
      x = Math.round((cx - width / 2) * 100) / 100
      y = Math.round((cy - e.height / 2) * 100) / 100
      notes.widened = true
    }
  }
  // One line, vertically centred in the dslrBooth box (a fixed size makes dslrBooth fit the box to the line, observed).
  const lineHeight = notes.lineBreaks
    ? 1.15
    : Math.max(0.5, Math.round((e.height / fontSize) * 10000) / 10000)

  return {
    fields: {
      type: 'text',
      content: t.content,
      fontFamily,
      fontSize,
      fontWeight,
      fontStyle: italic ? 'italic' : 'normal',
      align,
      lineHeight,
      letterSpacing: 0,
      fill: literalColor(fill)
    },
    box: { x, y, width },
    notes
  }
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
      element: tagOf(e),
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
    if (e.kind === 'text') {
      if (e.width <= 0 || e.height <= 0) {
        badGeometry.push(e.name || 'text')
        keep('invalid-geometry', e)
        continue
      }
      usable.push(e)
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
  // back to file order (later in the file = further back). How dslrBooth orders EQUAL ZIndex values is not confirmed:
  // no local fixture has a tie, and the one observed case (6C owner template A, text and an opaque full-sheet picture
  // both at 0) only suggests that dslrBooth may draw the later one in front. The rule is kept (it keeps such text
  // visible) and each tie is reported by name; see docs/DSLRBOOTH_COMPATIBILITY.md §1d.
  const noZ = usable.filter((e) => !Number.isFinite(e.zIndex)).length
  if (noZ > 0)
    add(
      'warning',
      'z-index',
      `${plural(noZ, 'element')} had no stacking order (ZIndex); ${noZ === 1 ? 'it was' : 'they were'} placed at the back.`
    )
  const zKey = (e: DslrElementIn): number => (Number.isFinite(e.zIndex) ? e.zIndex : -Infinity)
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

  // Equal ZIndex values among the kept elements: say which, which one Template Studio put in front, and whether they
  // overlap (only then can the choice change the picture).
  const tied = new Map<number, DslrElementIn[]>()
  for (const e of kept)
    if (Number.isFinite(e.zIndex)) tied.set(e.zIndex, [...(tied.get(e.zIndex) ?? []), e])
  for (const [z, group] of tied) {
    if (group.length < 2) continue
    const frontFirst = [...group].sort((a, b) => a.index - b.index)
    const overlap = frontFirst.some((a, i) =>
      frontFirst.slice(i + 1).some((b) => boxesOverlap(a, b))
    )
    const names = frontFirst.map(elementLabel)
    add(
      overlap ? 'warning' : 'info',
      'z-index-tie',
      `${names.length} elements share the same stacking number (ZIndex ${z}): ${names.join(', ')}. ` +
        `dslrBooth’s order for equal numbers is not confirmed; Template Studio puts the one earlier in the file in front, so ${names[0]} is in front. ` +
        (overlap
          ? 'They overlap, so the order matters: compare with dslrBooth’s preview and reorder them in the Layers panel if needed.'
          : 'They do not overlap, so the order does not change the picture.')
    )
  }
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
  const texts: { name: string; notes: TextNotes; fontFamily: string; layer: TextLayer }[] = []
  kept.forEach((e, z) => {
    const id = makeId()
    const base = {
      id,
      name:
        e.name ||
        (e.kind === 'photo'
          ? `Photo ${e.photoNumber}`
          : e.kind === 'text'
            ? (e.text?.content.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '') || 'Text'
            : 'Picture'),
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
    if (e.kind === 'text' && e.text) {
      const m = mapText({ ...e, text: e.text })
      layer = { ...base, ...m.box, ...m.fields } as Layer
      texts.push({
        name: base.name,
        notes: m.notes,
        fontFamily: m.fields.fontFamily as string,
        layer: layer as TextLayer
      })
    } else if (e.kind === 'photo') {
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
    if (Object.keys(e.extra).length > 0) layerData[id] = { element: tagOf(e), attributes: e.extra }
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
  // ---- live text (6C C1) ------------------------------------------------------------------------------------------
  const listOf = (rows: typeof texts): string =>
    rows
      .slice(0, 3)
      .map((r) => quote(r.name))
      .join(', ') + (rows.length > 3 ? ', …' : '')
  const textNote = (
    severity: DslrImportSeverity,
    code: string,
    pick: (n: TextNotes) => boolean,
    message: (n: number, list: string) => string
  ): void => {
    const rows = texts.filter((r) => pick(r.notes))
    if (rows.length > 0) add(severity, code, message(rows.length, listOf(rows)))
  }
  if (texts.length > 0) {
    add(
      'info',
      'live-text',
      `${plural(texts.length, 'live text element')} from dslrBooth’s editor came in as editable text (${listOf(texts)}). When you export back to dslrBooth, Template Studio draws text into the artwork, as it does for all text: the booth PC needs no fonts, but the text can no longer be retyped in dslrBooth’s own editor.`
    )
    const fonts = [...new Set(texts.map((r) => r.fontFamily))].sort()
    add(
      'info',
      'text-fonts',
      `Text uses ${fonts.length === 1 ? 'the font' : 'these fonts'}: ${fonts.join(', ')}. A font that is not installed on this computer keeps its name and is shown with a stand-in font until it is installed (see the font warnings).`
    )
  }
  textNote(
    'warning',
    'text-auto-size',
    (n) => n.auto,
    (n, list) =>
      `${plural(n, 'text')} (${list}) used dslrBooth’s “Auto” size, which stretches the letters to fill the whole box. Template Studio cannot stretch letters, so ${n === 1 ? 'it was' : 'each was'} given the largest normal size that fits ${n === 1 ? 'its' : 'their'} box. Compare with dslrBooth’s preview and adjust the size if needed.`
  )
  // A line wider than its box: dslrBooth cuts it off at the box edge (observed, fixture T13); Template Studio cannot
  // (text always wraps; a no-wrap/clip mode would need a TextLayer field, proposed in ADR-052, OPEN) and keeps all of it. Say
  // per text how far the wrapped lines reach and what they run into, so the operator fixes it before exporting.
  for (const r of texts.filter((x) => x.notes.overflow)) {
    const l = r.layer
    const lines = r.notes.overflowLines
    const reach = { x: l.x, y: l.y, width: l.width, height: lines * l.fontSize * l.lineHeight }
    const hit = project.layers.filter(
      (o) =>
        o.id !== l.id &&
        o.visible &&
        boxesOverlap(
          { ...reach, y: l.y + l.height, height: Math.max(0, reach.height - l.height) },
          o
        )
    )
    const name = (o: Layer): string =>
      o.type === 'photo'
        ? `photo slot ${o.photoNumber}`
        : quote(o.type === 'text' ? o.content : o.name)
    const over = hit.filter((o) => o.zIndex < l.zIndex).map(name)
    const under = hit.filter((o) => o.zIndex > l.zIndex).map(name)
    const runs = [
      over.length > 0 ? `over ${over.join(', ')}` : '',
      under.length > 0 ? `under ${under.join(', ')}` : ''
    ].filter(Boolean)
    const covered = hit.some((o) => o.type === 'photo' && o.zIndex > l.zIndex)
    add(
      'warning',
      'text-overflow',
      `Text ${quote(r.name)} is wider than its ${Math.round(l.width)} px box. dslrBooth cuts the line off at the box edge; Template Studio keeps all of the text and wraps it` +
        (lines > 1
          ? `, here onto about ${lines} lines running below the box${runs.length > 0 ? ` and ${runs.join(' and ')}` : ''}.`
          : '.') +
        (covered ? ' The guest photo covers the part under the photo slot in the print.' : '') +
        ' Nothing was removed. Widen the box, shorten the text or make it smaller before exporting.'
    )
  }
  textNote(
    'info',
    'text-box-widened',
    (n) => n.widened,
    (n, list) =>
      `${plural(n, 'text box', 'text boxes')} (${list}) ${n === 1 ? 'was' : 'were'} made a little wider so the line is not wrapped (fonts measure slightly differently here). The text stays where it was.`
  )
  textNote(
    'warning',
    'text-line-breaks',
    (n) => n.lineBreaks,
    (n, list) =>
      `${plural(n, 'text')} (${list}) ${n === 1 ? 'contains' : 'contain'} line breaks, which dslrBooth’s editor cannot type (seen: only one line is kept). How dslrBooth draws them is not known; Template Studio shows separate lines.`
  )
  textNote(
    'warning',
    'text-font-stretch',
    (n) => n.stretch.length > 0,
    (n, list) =>
      `${plural(n, 'text')} (${list}) used a condensed or expanded font style. Template Studio has no width setting, so the font’s normal width is used; choose a condensed font family instead if you have one.`
  )
  textNote(
    'warning',
    'text-weight',
    (n) => n.unknownWeight !== null,
    (n, list) =>
      `${plural(n, 'text')} (${list}) had a font style Template Studio did not recognise (${[...new Set(texts.flatMap((r) => (r.notes.unknownWeight === null ? [] : [quote(r.notes.unknownWeight)])))].join(', ')}); the recognised parts were used, otherwise Regular.`
  )
  textNote(
    'info',
    'text-bold-italic',
    (n) => n.boldItalicAsItalic,
    (n, list) =>
      `${plural(n, 'text')} (${list}) ${n === 1 ? 'is' : 'are'} set to “Bold Italic” in dslrBooth, but dslrBooth draws that as Italic only, so ${n === 1 ? 'it was' : 'they were'} imported as printed: Italic. Choose Bold in the inspector if you want bold.`
  )
  textNote(
    'warning',
    'text-align',
    (n) => n.badAlign !== null,
    (n, list) => `${plural(n, 'text')} (${list}) had an unknown alignment; centred is used.`
  )
  textNote(
    'warning',
    'text-color',
    (n) => n.badColor !== null,
    (n, list) =>
      `${plural(n, 'text')} (${list}) had a colour that could not be read; black is used.`
  )
  textNote(
    'warning',
    'text-size',
    (n) => n.badSize !== null,
    (n, list) =>
      `${plural(n, 'text')} (${list}) had no readable font size; the largest size that fits the box is used.`
  )
  textNote(
    'info',
    'text-font-default',
    (n) => n.noFont,
    (n, list) =>
      `${plural(n, 'text')} (${list}) named no font; Arial (dslrBooth’s default) is used.`
  )
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
  if (texts.length > 0)
    add(
      'info',
      'flattened-artwork',
      'Pictures come in as dslrBooth stored them; they can be moved and resized. Text that is part of a picture cannot be retyped (dslrBooth’s live text is editable).'
    )
  else
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
