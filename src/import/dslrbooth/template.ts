import { MAX_DPI, MAX_PHYSICAL_SIDE_IN, MAX_PIXEL_SIDE } from '@domain'
import { parseXml, XmlReadError, type XmlElement } from './xml'

/**
 * Reads a dslrBooth `template.xml` into plain, typed element records (DSLR Booth importer). Pure; no Node APIs.
 * Field meanings and defaults follow research/DSLRBOOTH_FIXTURE_ANALYSIS.md (CONFIRMED FROM FILE) and the runtime
 * findings; anything else is kept verbatim and reported, never silently dropped.
 */

export type DslrImportSeverity = 'error' | 'warning' | 'info'
export interface DslrImportItem {
  severity: DslrImportSeverity
  code: string
  message: string
}

/** A fatal problem: the file cannot be imported at all. The message is safe to show. */
export class DslrImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DslrImportError'
  }
}

/** Attributes the importer understands on `<Image>` / `<Photo>` (fixture attribute set). */
export const KNOWN_ELEMENT_ATTRIBUTES = new Set([
  'Name',
  'IsVisible',
  'Opacity',
  'ShadowEnabled',
  'ShadowColor',
  'ShadowDepth',
  'ShadowRadius',
  'ShadowDirection',
  'Width',
  'Height',
  'Top',
  'Left',
  'ImagePath',
  'KeepAspect',
  'Thickness',
  'StrokeColor',
  'PhotoNumber',
  'ZIndex',
  'Rotation',
  'IsLocked'
])
/**
 * Attributes the importer understands on `<Text>` (dslrBooth 7.48 live text, synthetic fixture
 * tests/fixtures/dslrbooth/synthetic/, research/PHASE_6C_RESULTS.md). `KeepAspect` on text only locks resizing in
 * dslrBooth's editor; it is kept in the import notes.
 */
export const KNOWN_TEXT_ATTRIBUTES = new Set([
  'Name',
  'IsVisible',
  'Opacity',
  'ShadowEnabled',
  'ShadowColor',
  'ShadowDepth',
  'ShadowRadius',
  'ShadowDirection',
  'Text',
  'FontName',
  'FontWeight',
  'Width',
  'Height',
  'Top',
  'Left',
  'FontColor',
  'IsBold',
  'IsItalic',
  'FontSize',
  'TextHorizontalAlignment',
  'ZIndex',
  'Rotation',
  'IsLocked'
])
const SHADOW_ATTRIBUTES = [
  'ShadowEnabled',
  'ShadowColor',
  'ShadowDepth',
  'ShadowRadius',
  'ShadowDirection'
]

/** A live `<Text>` element's own settings (observed meanings: research/PHASE_6C_RESULTS.md, live-text fixture). */
export interface DslrTextIn {
  /** `Text`, exactly as stored (entities decoded, nothing trimmed). */
  content: string
  /** `FontName`, trimmed; '' when absent. */
  fontName: string
  /** `FontWeight` as stored ("Regular", "Bold", "Bold Italic", …); '' when absent. */
  fontWeight: string
  /** `FontSize`: a positive number, 0 = dslrBooth's "Auto" (stretch to fill the box), NaN when absent/unreadable. */
  fontSize: number
  /** Legacy `IsBold` / `IsItalic` flags (dslrBooth 7.48's editor leaves them False). */
  isBold: boolean
  isItalic: boolean
  /** `TextHorizontalAlignment` as stored (observed 0 left, 1 centre, 2 right); NaN when absent/unreadable. */
  alignment: number
  /** Domain hex, or null when absent/unreadable. */
  color: string | null
  /** The raw `FontColor` (for a precise warning). */
  colorRaw: string | undefined
}

export interface DslrElementIn {
  kind: 'photo' | 'image' | 'text'
  /** Position in the XML (0 = first). */
  index: number
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  /** 0..1 */
  opacity: number
  visible: boolean
  locked: boolean
  /** NaN when absent or unreadable. */
  zIndex: number
  photoNumber: number
  imagePath: string
  keepAspect: boolean
  thickness: number
  /** Domain hex (`#rrggbb[aa]`) or null when absent/unreadable. */
  strokeColor: string | null
  shadowEnabled: boolean
  /** Present for `kind: 'text'`. */
  text?: DslrTextIn
  /** Values the model cannot hold, kept verbatim for the adapter (unknown attributes, enabled shadow, …). */
  extra: Record<string, string>
  attributes: Record<string, string>
}

export interface DslrTemplateIn {
  hasBom: boolean
  root: Record<string, string>
  rootOrder: string[]
  name: string
  widthPx: number
  heightPx: number
  dpi: number
  /** Domain hex. */
  backgroundColor: string
  elements: DslrElementIn[]
  /** Elements the importer does not understand, verbatim (JSON-safe). */
  unknown: { element: string; attributes: Record<string, string>; children: number; text: string }[]
  items: DslrImportItem[]
}

const NUMBER = /^\s*[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?\s*$/

const num = (v: string | undefined): number => (v !== undefined && NUMBER.test(v) ? Number(v) : NaN)
const bool = (v: string | undefined, fallback: boolean): boolean =>
  v === undefined
    ? fallback
    : /^\s*true\s*$/i.test(v)
      ? true
      : /^\s*false\s*$/i.test(v)
        ? false
        : fallback

/** dslrBooth `#AARRGGBB` (or `#RRGGBB`) → domain `#rrggbb` / `#rrggbbaa`; null when unreadable. */
export function fromArgb(v: string | undefined): string | null {
  if (v === undefined) return null
  const m = /^\s*#([0-9a-fA-F]{2})?([0-9a-fA-F]{6})\s*$/.exec(v)
  if (!m) return null
  const rgb = (m[2] as string).toLowerCase()
  const a = (m[1] ?? 'ff').toLowerCase()
  return a === 'ff' ? `#${rgb}` : `#${rgb}${a}`
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

function toJsonish(el: XmlElement): DslrTemplateIn['unknown'][number] {
  return {
    element: el.name,
    attributes: { ...el.attributes },
    children: el.children.length,
    text: el.text.slice(0, 2000)
  }
}

export function readDslrTemplate(bytes: Uint8Array): DslrTemplateIn {
  let doc
  try {
    doc = parseXml(bytes)
  } catch (e) {
    throw new DslrImportError(
      `template.xml could not be read: ${e instanceof XmlReadError ? e.message : 'it is not valid XML'}.`
    )
  }
  const items: DslrImportItem[] = []
  const add = (severity: DslrImportSeverity, code: string, message: string): void => {
    items.push({ severity, code, message })
  }
  const root = doc.root
  if (root.name !== 'Template')
    throw new DslrImportError(
      `This is not a dslrBooth template: template.xml starts with <${root.name}> instead of <Template>.`
    )

  const widthPx = num(root.attributes.Width)
  const heightPx = num(root.attributes.Height)
  const dpi = num(root.attributes.Resolution)
  const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n > 0
  if (!isPositiveInt(widthPx) || !isPositiveInt(heightPx))
    throw new DslrImportError('The template has no valid canvas size (Width and Height).')
  if (!isPositiveInt(dpi) || dpi > MAX_DPI)
    throw new DslrImportError('The template has no valid resolution (Resolution, in DPI).')
  if (
    widthPx > MAX_PIXEL_SIDE ||
    heightPx > MAX_PIXEL_SIDE ||
    widthPx / dpi > MAX_PHYSICAL_SIDE_IN ||
    heightPx / dpi > MAX_PHYSICAL_SIDE_IN
  )
    throw new DslrImportError(
      `The canvas (${widthPx}×${heightPx} at ${dpi} DPI) is larger than Template Studio supports.`
    )

  let backgroundColor = fromArgb(root.attributes.BackgroundColor)
  if (backgroundColor === null) {
    if (root.attributes.BackgroundColor !== undefined)
      add(
        'warning',
        'background-color',
        `The canvas colour "${root.attributes.BackgroundColor}" could not be read; white is used instead.`
      )
    backgroundColor = '#ffffff'
  }

  const unknown: DslrTemplateIn['unknown'] = []
  const containers = root.children.filter((c) => c.name === 'Elements')
  for (const c of root.children) if (c.name !== 'Elements') unknown.push(toJsonish(c))
  if (containers.length > 1)
    add(
      'warning',
      'elements-multiple',
      'The template has more than one element list; all were read.'
    )

  const elements: DslrElementIn[] = []
  let index = 0
  for (const container of containers) {
    for (const el of container.children) {
      const i = index++
      // A <Text> without a Text attribute was never seen; it stays an unknown element rather than an empty layer.
      const isText = el.name === 'Text' && el.attributes.Text !== undefined
      if (el.name !== 'Image' && el.name !== 'Photo' && !isText) {
        unknown.push(toJsonish(el))
        continue
      }
      const a = el.attributes
      const kind = el.name === 'Photo' ? 'photo' : isText ? 'text' : 'image'
      const known = kind === 'text' ? KNOWN_TEXT_ATTRIBUTES : KNOWN_ELEMENT_ATTRIBUTES
      const extra: Record<string, string> = {}
      for (const key of el.order) if (!known.has(key)) extra[key] = a[key] as string
      if (el.children.length > 0 || el.text !== '')
        extra['#content'] = JSON.stringify(el.children.map(toJsonish)).slice(0, 4000)
      const shadowEnabled = bool(a.ShadowEnabled, false)
      if (shadowEnabled)
        for (const key of SHADOW_ATTRIBUTES) if (a[key] !== undefined) extra[key] = a[key] as string
      const keepAspect = bool(a.KeepAspect, true)
      if (kind === 'photo' && !keepAspect) extra.KeepAspect = a.KeepAspect as string
      const opacityRaw = num(a.Opacity)
      const fontSize = num(a.FontSize)
      // Auto size is kept in the notes: Template Studio stores a fixed size that approximates it.
      if (kind === 'text' && fontSize === 0) extra.FontSize = a.FontSize as string
      // A style name Template Studio maps differently from its name (Bold Italic → Italic) is kept verbatim.
      if (
        kind === 'text' &&
        /bold/i.test(a.FontWeight ?? '') &&
        /italic|oblique/i.test(a.FontWeight ?? '')
      )
        extra.FontWeight = a.FontWeight as string
      const text: DslrTextIn | undefined =
        kind === 'text'
          ? {
              content: a.Text as string,
              fontName: (a.FontName ?? '').trim(),
              fontWeight: (a.FontWeight ?? '').trim(),
              fontSize,
              isBold: bool(a.IsBold, false),
              isItalic: bool(a.IsItalic, false),
              alignment: num(a.TextHorizontalAlignment),
              color: fromArgb(a.FontColor),
              colorRaw: a.FontColor
            }
          : undefined
      elements.push({
        kind,
        index: i,
        name: (a.Name ?? '').trim().slice(0, 200),
        x: num(a.Left),
        y: num(a.Top),
        width: num(a.Width),
        height: num(a.Height),
        rotation: a.Rotation === undefined ? 0 : num(a.Rotation),
        opacity: Number.isFinite(opacityRaw) ? Math.min(1, Math.max(0, opacityRaw / 100)) : 1,
        visible: bool(a.IsVisible, true),
        locked: bool(a.IsLocked, false),
        zIndex: num(a.ZIndex),
        photoNumber: num(a.PhotoNumber),
        imagePath: a.ImagePath ?? '',
        keepAspect,
        thickness: Number.isFinite(num(a.Thickness)) ? Math.max(0, num(a.Thickness)) : 0,
        strokeColor: fromArgb(a.StrokeColor),
        shadowEnabled,
        ...(text ? { text } : {}),
        extra,
        attributes: { ...a }
      })
    }
  }

  for (const u of unknown)
    add(
      'warning',
      'unknown-element',
      `<${u.element}> is not something Template Studio knows. It was kept in the project's import notes but is not shown.`
    )
  const unknownAttrs = new Set(
    elements.flatMap((e) =>
      Object.keys(e.extra).filter(
        (k) =>
          !k.startsWith('Shadow') &&
          k !== 'KeepAspect' &&
          k !== '#content' &&
          !(e.kind === 'text' && (k === 'FontSize' || k === 'FontWeight'))
      )
    )
  )
  if (unknownAttrs.size > 0)
    add(
      'info',
      'unknown-attributes',
      `Unknown settings were kept in the import notes: ${[...unknownAttrs].sort().join(', ')}.`
    )

  const name = (root.attributes.Name ?? '').trim()
  return {
    hasBom: doc.hasBom,
    root: { ...root.attributes },
    rootOrder: [...root.order],
    name,
    widthPx,
    heightPx,
    dpi,
    backgroundColor,
    elements,
    unknown,
    items
  }
}

export { plural }
