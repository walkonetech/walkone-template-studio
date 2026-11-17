/**
 * dslrBooth `template.xml` (Phase 6B, profile "7.48"). Pure and shared by the renderer (which writes it) and the main
 * process (which re-reads it to verify the package before writing). The text format copies what the real exports in
 * `tests/fixtures/dslrbooth/source/` contain (research/DSLRBOOTH_FIXTURE_ANALYSIS.md §2): UTF-8 with a BOM, CRLF line
 * endings, a fixed attribute order, two-space indentation, self-closing elements written `<Image ... />`, and no line
 * break after `</Template>`. Only `Image` and `Photo` elements exist in that evidence, so only those are written.
 */

/** Observed element defaults (every fixture element carries them; shadows/borders were never enabled). */
export const ELEMENT_DEFAULTS = {
  Opacity: '100',
  ShadowEnabled: 'False',
  ShadowColor: '#FF000000',
  ShadowDepth: '10',
  ShadowRadius: '20',
  ShadowDirection: '-45',
  KeepAspect: 'True',
  Thickness: '0',
  StrokeColor: '#FF000000'
} as const

export interface DslrRoot {
  name: string
  width: number
  height: number
  /** Meaning unknown (0 in four fixtures, 1 in one); written as observed for portrait/strip templates. */
  dimensions: number
  resolution: number
  /** `#AARRGGBB` */
  backgroundColor: string
  print2PerPage: boolean
  /** `MM/DD/YYYY HH:mm:ss` */
  lastSavedDate: string
  id: string
  originalDevice: string
}

interface ElementBase {
  name: string
  left: number
  top: number
  width: number
  height: number
  zIndex: number
  /** Clockwise degrees about the box centre; omitted when 0. */
  rotation?: number
}
export interface DslrImageElement extends ElementBase {
  type: 'Image'
  imagePath: string
}
export interface DslrPhotoElement extends ElementBase {
  type: 'Photo'
  photoNumber: number
}
export type DslrElement = DslrImageElement | DslrPhotoElement

export interface DslrTemplate {
  root: DslrRoot
  elements: DslrElement[]
}

/** XML attribute escaping (double-quoted attributes). */
export const escapeAttr = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#xD;')
    .replace(/\n/g, '&#xA;')
    .replace(/\t/g, '&#x9;')

const bool = (b: boolean): string => (b ? 'True' : 'False')
const int = (n: number): string => {
  if (!Number.isInteger(n)) throw new RangeError(`Expected an integer, got ${n}`)
  return String(n === 0 ? 0 : n)
}
const attrs = (pairs: [string, string][]): string =>
  pairs.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')

function elementLine(e: DslrElement): string {
  const pairs: [string, string][] = [
    ['Name', e.name],
    ['Opacity', ELEMENT_DEFAULTS.Opacity],
    ['ShadowEnabled', ELEMENT_DEFAULTS.ShadowEnabled],
    ['ShadowColor', ELEMENT_DEFAULTS.ShadowColor],
    ['ShadowDepth', ELEMENT_DEFAULTS.ShadowDepth],
    ['ShadowRadius', ELEMENT_DEFAULTS.ShadowRadius],
    ['ShadowDirection', ELEMENT_DEFAULTS.ShadowDirection],
    ['Width', int(e.width)],
    ['Height', int(e.height)],
    ['Top', int(e.top)],
    ['Left', int(e.left)],
    ['ImagePath', e.type === 'Image' ? e.imagePath : ''],
    ['KeepAspect', ELEMENT_DEFAULTS.KeepAspect],
    ['Thickness', ELEMENT_DEFAULTS.Thickness],
    ['StrokeColor', ELEMENT_DEFAULTS.StrokeColor]
  ]
  if (e.type === 'Photo') pairs.push(['PhotoNumber', int(e.photoNumber)])
  pairs.push(['ZIndex', int(e.zIndex)])
  if (e.rotation !== undefined && e.rotation !== 0) pairs.push(['Rotation', int(e.rotation)])
  pairs.push(['IsLocked', 'False'])
  return `    <${e.type} ${attrs(pairs)} />`
}

/**
 * The XML text (without the BOM; `encodeTemplateXml` adds it). Elements are written in DESCENDING ZIndex, as in every
 * fixture. Throws on a non-integer geometry value: callers round deterministically first.
 */
export function writeTemplateXml(t: DslrTemplate): string {
  const r = t.root
  const root = attrs([
    ['Name', r.name],
    ['Width', int(r.width)],
    ['Height', int(r.height)],
    ['Dimensions', int(r.dimensions)],
    ['Resolution', int(r.resolution)],
    ['BackgroundColor', r.backgroundColor],
    ['print_2_per_page', bool(r.print2PerPage)],
    ['PrintToSecondaryPrinter', 'False'],
    ['LastSavedDate', r.lastSavedDate],
    ['Id', r.id],
    ['IsLegacy', 'True'],
    ['OriginalDevice', r.originalDevice]
  ])
  const ordered = [...t.elements].sort((a, b) => b.zIndex - a.zIndex)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Template ${root}>`,
    '  <Elements>',
    ...ordered.map(elementLine),
    '  </Elements>',
    '</Template>'
  ].join('\r\n')
}

const BOM = [0xef, 0xbb, 0xbf]

/** UTF-8 bytes with the BOM, as the fixtures are stored. */
export function encodeTemplateXml(xml: string): Uint8Array {
  const body = new TextEncoder().encode(xml)
  const out = new Uint8Array(BOM.length + body.length)
  out.set(BOM)
  out.set(body, BOM.length)
  return out
}

// ------------------------------------------------------------------------------------------------ reading

export interface ParsedElement {
  type: string
  attributes: Record<string, string>
  /** Attribute names in file order. */
  order: string[]
}
export interface ParsedTemplate {
  hasBom: boolean
  root: Record<string, string>
  rootOrder: string[]
  elements: ParsedElement[]
}

const unescape = (v: string): string =>
  v.replace(/&(amp|lt|gt|quot|apos|#x([0-9a-fA-F]+)|#(\d+));/g, (m, name: string, hex, dec) => {
    if (hex) return String.fromCodePoint(parseInt(hex as string, 16))
    if (dec) return String.fromCodePoint(parseInt(dec as string, 10))
    return (
      ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name] ?? m
    )
  })

function parseAttributes(s: string): { attributes: Record<string, string>; order: string[] } {
  const attributes: Record<string, string> = {}
  const order: string[] = []
  const re = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    const key = m[1] as string
    if (key in attributes) throw new SyntaxError(`Duplicate attribute ${key}`)
    attributes[key] = unescape(m[2] ?? m[3] ?? '')
    order.push(key)
  }
  return { attributes, order }
}

/**
 * Reads the flat dslrBooth template format (root `Template`, one `Elements` child of self-closing elements). Enough
 * to verify what the exporter wrote and to inspect fixtures; it is NOT a general XML parser (the importer, a later
 * phase, will need a real one). Throws `SyntaxError` on anything else.
 */
export function parseTemplateXml(input: Uint8Array | string): ParsedTemplate {
  const BOM_CHAR = String.fromCharCode(0xfeff)
  let text =
    typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input)
  const hasBom =
    typeof input === 'string'
      ? text.startsWith(BOM_CHAR)
      : input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf
  if (text.startsWith(BOM_CHAR)) text = text.slice(1)
  const decl = /^<\?xml[^>]*\?>\s*/.exec(text)
  if (decl) text = text.slice(decl[0].length)
  const rootM = /^<Template\b([^>]*)>\s*<Elements>([\s\S]*?)<\/Elements>\s*<\/Template>\s*$/.exec(
    text
  )
  if (!rootM) throw new SyntaxError('Not a dslrBooth template (expected <Template><Elements>…)')
  const root = parseAttributes(rootM[1] as string)
  const elements: ParsedElement[] = []
  const body = (rootM[2] as string).trim()
  const elRe = /<([A-Za-z_][\w.-]*)\b([^<>]*?)\/>\s*/y
  let pos = 0
  while (pos < body.length) {
    elRe.lastIndex = pos
    const m = elRe.exec(body)
    if (!m) throw new SyntaxError(`Unexpected content in <Elements> at ${pos}`)
    const { attributes, order } = parseAttributes(m[2] as string)
    elements.push({ type: m[1] as string, attributes, order })
    pos = elRe.lastIndex
  }
  return { hasBom, root: root.attributes, rootOrder: root.order, elements }
}
