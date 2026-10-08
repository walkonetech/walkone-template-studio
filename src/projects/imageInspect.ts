import type { AssetMediaType } from '../domain'
import { PersistenceError } from './errors'

/**
 * Format sniffing, header parsing and the SVG safety policy for imported images. Pure and dependency-free:
 * the format is decided from the BYTES (never the file name or extension), and dimensions/alpha are read
 * from the file headers, so no native image library is needed. Full pixel decoding happens in the
 * renderer when an image is first drawn; a file whose headers are valid but whose pixel data is broken
 * therefore surfaces there (as a "could not preview" asset), not here.
 */

export interface ImageInfo {
  mediaType: AssetMediaType
  /** File extension to store the asset under (no dot). */
  extension: 'png' | 'jpg' | 'webp' | 'svg'
  pixelWidth: number
  pixelHeight: number
  /** Known for PNG and WebP; JPEG is never transparent; left undefined for SVG. */
  hasAlpha: boolean | undefined
}

/** Largest image the importer accepts, in pixels (a decompression-bomb guard; 12000×8000 is ~96 MP). */
export const MAX_IMAGE_PIXELS = 150_000_000
/** Raster/SVG byte limits. SVG is text and is scanned in memory, so its limit is much smaller. */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024
export const MAX_SVG_BYTES = 8 * 1024 * 1024

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_IEND = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]

const startsWith = (d: Uint8Array, bytes: number[], at = 0): boolean =>
  bytes.every((b, i) => d[at + i] === b)
const ascii = (d: Uint8Array, at: number, len: number): string =>
  String.fromCharCode(...d.subarray(at, at + len))
const u32be = (d: Uint8Array, at: number): number =>
  ((d[at] ?? 0) * 0x1000000 +
    ((d[at + 1] ?? 0) << 16) +
    ((d[at + 2] ?? 0) << 8) +
    (d[at + 3] ?? 0)) >>>
  0
const u16be = (d: Uint8Array, at: number): number => ((d[at] ?? 0) << 8) | (d[at + 1] ?? 0)
const u24le = (d: Uint8Array, at: number): number =>
  (d[at] ?? 0) | ((d[at + 1] ?? 0) << 8) | ((d[at + 2] ?? 0) << 16)

const decodeFailed = (what: string): PersistenceError =>
  new PersistenceError('decode-failed', `This ${what} file looks damaged and could not be read.`)

function checkDimensions(width: number, height: number, what: string): void {
  if (!(width > 0) || !(height > 0)) throw decodeFailed(what)
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new PersistenceError(
      'image-too-large',
      'This image has too many pixels to import safely. Reduce its resolution and try again.'
    )
  }
}

function inspectPng(d: Uint8Array): ImageInfo {
  // signature(8) + IHDR chunk: length(4)=13, "IHDR", width(4), height(4), depth, colorType, ...
  if (d.length < 33 || u32be(d, 8) !== 13 || ascii(d, 12, 4) !== 'IHDR') throw decodeFailed('PNG')
  const pixelWidth = u32be(d, 16)
  const pixelHeight = u32be(d, 20)
  const colorType = d[25] ?? -1
  checkDimensions(pixelWidth, pixelHeight, 'PNG')
  if (d.length < 45 || !startsWith(d, PNG_IEND, d.length - PNG_IEND.length)) {
    throw decodeFailed('PNG') // truncated: no IEND terminator
  }
  // Transparency: an alpha channel, or a tRNS chunk (palette / color-key transparency) before the pixel data.
  let hasAlpha = colorType === 4 || colorType === 6
  let at = 33
  while (!hasAlpha && at + 8 <= d.length) {
    const len = u32be(d, at)
    const type = ascii(d, at + 4, 4)
    if (type === 'tRNS') hasAlpha = true
    if (type === 'IDAT' || type === 'IEND') break
    at += 12 + len
  }
  return { mediaType: 'image/png', extension: 'png', pixelWidth, pixelHeight, hasAlpha }
}

function inspectJpeg(d: Uint8Array): ImageInfo {
  let at = 2
  while (at + 4 <= d.length) {
    if (d[at] !== 0xff) {
      at++
      continue
    }
    const marker = d[at + 1] ?? 0
    if (marker === 0xff) {
      at++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break // end of image / start of scan: no frame header found
    const len = u16be(d, at + 2)
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      if (at + 9 > d.length) break
      const pixelHeight = u16be(d, at + 5)
      const pixelWidth = u16be(d, at + 7)
      checkDimensions(pixelWidth, pixelHeight, 'JPEG')
      return { mediaType: 'image/jpeg', extension: 'jpg', pixelWidth, pixelHeight, hasAlpha: false }
    }
    if (len < 2) break
    at += 2 + len
  }
  throw decodeFailed('JPEG')
}

function inspectWebp(d: Uint8Array): ImageInfo {
  if (d.length < 25) throw decodeFailed('WebP')
  const riffSize = littleU32(d, 4)
  if (riffSize + 8 > d.length + 1) throw decodeFailed('WebP') // truncated
  const kind = ascii(d, 12, 4)
  if (kind === 'VP8 ') {
    if (d.length < 30) throw decodeFailed('WebP')
    // 3-byte frame tag, start code 9d 01 2a, then 14-bit width/height
    if (d[23] !== 0x9d || d[24] !== 0x01 || d[25] !== 0x2a) throw decodeFailed('WebP')
    const pixelWidth = ((d[26] ?? 0) | ((d[27] ?? 0) << 8)) & 0x3fff
    const pixelHeight = ((d[28] ?? 0) | ((d[29] ?? 0) << 8)) & 0x3fff
    checkDimensions(pixelWidth, pixelHeight, 'WebP')
    return { mediaType: 'image/webp', extension: 'webp', pixelWidth, pixelHeight, hasAlpha: false }
  }
  if (kind === 'VP8L') {
    if (d[20] !== 0x2f) throw decodeFailed('WebP')
    const bits = littleU32(d, 21)
    const pixelWidth = (bits & 0x3fff) + 1
    const pixelHeight = ((bits >>> 14) & 0x3fff) + 1
    const hasAlpha = ((bits >>> 28) & 1) === 1
    checkDimensions(pixelWidth, pixelHeight, 'WebP')
    return { mediaType: 'image/webp', extension: 'webp', pixelWidth, pixelHeight, hasAlpha }
  }
  if (kind === 'VP8X') {
    if (d.length < 30) throw decodeFailed('WebP')
    const flags = d[20] ?? 0
    const pixelWidth = u24le(d, 24) + 1
    const pixelHeight = u24le(d, 27) + 1
    checkDimensions(pixelWidth, pixelHeight, 'WebP')
    return {
      mediaType: 'image/webp',
      extension: 'webp',
      pixelWidth,
      pixelHeight,
      hasAlpha: (flags & 0x10) !== 0
    }
  }
  throw decodeFailed('WebP')
}

function littleU32(d: Uint8Array, at: number): number {
  return (
    ((d[at] ?? 0) |
      ((d[at + 1] ?? 0) << 8) |
      ((d[at + 2] ?? 0) << 16) |
      ((d[at + 3] ?? 0) << 24)) >>>
    0
  )
}

// ---------------------------------------------------------------------------------------------- SVG

const SVG_LENGTH_UNITS: Record<string, number> = {
  '': 1,
  px: 1,
  pt: 96 / 72,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4
}

function parseSvgLength(raw: string | undefined): number | null {
  if (!raw) return null
  const m = /^\s*([0-9]*\.?[0-9]+(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(raw)
  if (!m) return null
  const factor = SVG_LENGTH_UNITS[(m[2] ?? '').toLowerCase()]
  if (factor === undefined) return null // %, em, ex … have no absolute size
  const value = Number(m[1]) * factor
  return Number.isFinite(value) && value > 0 ? value : null
}

/** The attributes of the first `<svg …>` start tag (quote-aware), or null if there is none. */
function rootSvgAttributes(text: string): Record<string, string> | null {
  const start = /<svg[\s>/]/i.exec(text)
  if (!start) return null
  const attrs: Record<string, string> = {}
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let i = start.index + 4
  // Find the end of the start tag, skipping quoted values.
  let quote: string | null = null
  let end = text.length
  for (; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') {
      end = i
      break
    }
  }
  const tag = text.slice(start.index + 4, end)
  for (let m = re.exec(tag); m; m = re.exec(tag))
    attrs[(m[1] ?? '').toLowerCase()] = m[3] ?? m[4] ?? ''
  return attrs
}

export interface SvgPolicyViolation {
  rule: string
  hint: string
}

/**
 * SVG safety policy (ADR-036). SVG is untrusted document content, so it is REJECTED, never silently rewritten,
 * when it can run code or reach outside the file:
 *  - script / foreignObject / iframe / embed / object / audio / video / link / meta elements
 *  - `on*` event-handler attributes, `javascript:` / `vbscript:` / `data:text/html` URLs
 *  - any `href` / `xlink:href` / CSS `url()` / `@import` / `<?xml-stylesheet?>` that is not a same-document `#id`
 *    or an embedded `data:image/(png|jpeg|gif|webp)` image
 *  - a DOCTYPE internal subset or `<!ENTITY>` (entity expansion, XXE)
 * The check is deliberately conservative text matching on the raw file (comments included). It is the second
 * line of defense: the primary one is that the app only ever draws SVG as an `<img>` (a data: URL), where
 * browsers run no script and load no external resource, and never inserts it into the DOM.
 */
export function findSvgViolation(text: string): SvgPolicyViolation | null {
  const checks: [RegExp, SvgPolicyViolation][] = [
    [
      /<\s*(script|foreignObject|iframe|embed|object|audio|video|link|meta)[\s/>]/i,
      { rule: 'active-element', hint: 'it contains a script or embedded content element' }
    ],
    [/\son[a-z]+\s*=/i, { rule: 'event-handler', hint: 'it contains an event handler' }],
    [/(javascript|vbscript)\s*:/i, { rule: 'script-url', hint: 'it contains a script URL' }],
    [/data\s*:\s*text\/html/i, { rule: 'html-data-url', hint: 'it embeds an HTML document' }],
    [/<!ENTITY/i, { rule: 'entity', hint: 'it declares XML entities' }],
    [/<!DOCTYPE[^>[]*\[/i, { rule: 'doctype-subset', hint: 'it has an internal DOCTYPE subset' }],
    [/<\?xml-stylesheet/i, { rule: 'stylesheet-pi', hint: 'it links an external stylesheet' }],
    [/@import/i, { rule: 'css-import', hint: 'it imports an external stylesheet' }]
  ]
  for (const [re, v] of checks) if (re.test(text)) return v

  // href / xlink:href targets: only "#id" or an embedded raster data URL are allowed.
  const hrefRe = /(?:^|[\s"'/])(?:xlink:)?href\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (let m = hrefRe.exec(text); m; m = hrefRe.exec(text)) {
    const target = (m[1] ?? m[2] ?? '').trim()
    if (target.startsWith('#')) continue
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(target)) continue
    return { rule: 'external-reference', hint: 'it references an external or unsupported resource' }
  }
  // CSS url(...) anywhere (attributes or <style>): only same-document references or embedded raster data.
  const urlRe = /url\(\s*(['"]?)\s*([^'")]*)/gi
  for (let m = urlRe.exec(text); m; m = urlRe.exec(text)) {
    const target = (m[2] ?? '').trim()
    if (target.startsWith('#')) continue
    if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(target)) continue
    return { rule: 'external-reference', hint: 'it references an external resource' }
  }
  return null
}

function inspectSvg(d: Uint8Array): ImageInfo {
  if (d.length > MAX_SVG_BYTES) {
    throw new PersistenceError('image-too-large', 'This SVG file is too large to import safely.')
  }
  const text = new TextDecoder('utf-8').decode(d).replace(/^\uFEFF/, '')
  const violation = findSvgViolation(text)
  if (violation) {
    throw new PersistenceError(
      'unsafe-svg',
      `This SVG was not imported because ${violation.hint}. Export it from your design tool as a plain SVG or a PNG.`,
      violation.rule
    )
  }
  const attrs = rootSvgAttributes(text)
  if (!attrs) throw decodeFailed('SVG')
  let width = parseSvgLength(attrs['width'])
  let height = parseSvgLength(attrs['height'])
  const vb = (attrs['viewbox'] ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const hasViewBox =
    vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
  if (hasViewBox) {
    const vw = vb[2] as number
    const vh = vb[3] as number
    if (width && !height) height = (width * vh) / vw
    else if (height && !width) width = (height * vw) / vh
    else if (!width && !height) {
      width = vw
      height = vh
    }
  }
  if (!width || !height) {
    throw new PersistenceError(
      'decode-failed',
      'This SVG has no usable size (it needs a width and height, or a viewBox).'
    )
  }
  const pixelWidth = Math.max(1, Math.round(width))
  const pixelHeight = Math.max(1, Math.round(height))
  checkDimensions(pixelWidth, pixelHeight, 'SVG')
  return {
    mediaType: 'image/svg+xml',
    extension: 'svg',
    pixelWidth,
    pixelHeight,
    hasAlpha: undefined
  }
}

function looksLikeSvg(d: Uint8Array): boolean {
  const head = new TextDecoder('utf-8').decode(d.subarray(0, 4096)).replace(/^\uFEFF/, '')
  return (
    /<svg[\s>/]/i.test(head) ||
    (/^\s*<\?xml/i.test(head) && /<svg[\s>/]/i.test(new TextDecoder().decode(d.subarray(0, 65536))))
  )
}

/** Identifies and validates an image from its bytes. Throws a PersistenceError with a user-safe message. */
export function inspectImage(data: Uint8Array): ImageInfo {
  if (data.length === 0) throw decodeFailed('empty')
  if (startsWith(data, PNG_SIGNATURE)) return inspectPng(data)
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return inspectJpeg(data)
  if (ascii(data, 0, 4) === 'RIFF' && ascii(data, 8, 4) === 'WEBP') return inspectWebp(data)
  if (looksLikeSvg(data)) return inspectSvg(data)
  throw new PersistenceError(
    'unsupported-format',
    'That file type is not supported. Use PNG, JPEG, WebP or SVG images.'
  )
}
