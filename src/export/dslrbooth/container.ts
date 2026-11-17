import { MAX_DSLR_ENTRIES, MAX_PHOTO_NUMBER, PREVIEW_PNG, TEMPLATE_XML } from './profile'
import { parseTemplateXml, type ParsedTemplate } from './templateXml'

/**
 * dslrBooth package container rules (Phase 6B), shared by the renderer (which assembles the entries) and the main
 * process (which verifies them before writing). The fixtures are flat ZIPs holding `template.xml`, `preview.png` and
 * the referenced PNGs, nothing else, in case-insensitive alphabetical order.
 */

/** Flat, portable entry names this app writes: letters, digits, `.`, `-`, `_`; `.png` or `template.xml`. */
const ENTRY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.(png|xml)$/

export const isSafeDslrEntryPath = (path: string): boolean =>
  ENTRY.test(path) && !path.includes('..') && (path.endsWith('.png') || path === TEMPLATE_XML)

/** Case-insensitive alphabetical, as in every fixture (ties broken by exact code-point order). */
export const compareEntryNames = (a: string, b: string): number => {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0
}

export class DslrPackageError extends Error {
  constructor(
    message: string,
    readonly detail?: string
  ) {
    super(message)
    this.name = 'DslrPackageError'
  }
}

const intAttr = (v: string | undefined): number | null =>
  v !== undefined && /^-?\d+$/.test(v) ? Number(v) : null

/**
 * Verifies a set of entries as a dslrBooth package this app may write. Checks structure only (pixel sizes of the PNGs
 * are checked by the caller). Returns the parsed template. Throws `DslrPackageError` with a user-readable message.
 */
export function verifyDslrPackage(
  entries: readonly { path: string; data: Uint8Array }[]
): ParsedTemplate {
  if (entries.length > MAX_DSLR_ENTRIES)
    throw new DslrPackageError('The template has too many files.')
  const names = new Set<string>()
  for (const e of entries) {
    if (!isSafeDslrEntryPath(e.path))
      throw new DslrPackageError('The template contained an invalid file name.', e.path)
    const key = e.path.toLowerCase()
    if (names.has(key))
      throw new DslrPackageError('The template contained a duplicate file.', e.path)
    names.add(key)
  }
  const xmlEntry = entries.find((e) => e.path === TEMPLATE_XML)
  if (!xmlEntry) throw new DslrPackageError('The template is missing template.xml.')
  if (!entries.some((e) => e.path === PREVIEW_PNG))
    throw new DslrPackageError('The template is missing preview.png.')
  let parsed: ParsedTemplate
  try {
    parsed = parseTemplateXml(xmlEntry.data)
  } catch (e) {
    throw new DslrPackageError('template.xml could not be read.', String(e))
  }
  if (!parsed.hasBom)
    throw new DslrPackageError('template.xml must be UTF-8 with a byte order mark.')
  const r = parsed.root
  for (const k of ['Width', 'Height', 'Resolution'])
    if ((intAttr(r[k]) ?? 0) <= 0) throw new DslrPackageError(`template.xml has an invalid ${k}.`)

  const pngs = new Set(entries.filter((e) => e.path.endsWith('.png')).map((e) => e.path))
  const referenced = new Set<string>()
  const zs = new Set<number>()
  let photos = 0
  for (const el of parsed.elements) {
    const a = el.attributes
    if (el.type !== 'Image' && el.type !== 'Photo')
      throw new DslrPackageError(`template.xml has an unsupported element <${el.type}>.`)
    for (const k of ['Width', 'Height', 'Top', 'Left', 'ZIndex'])
      if (intAttr(a[k]) === null)
        throw new DslrPackageError(`An element has an invalid ${k}.`, a.Name)
    if ((intAttr(a.Width) ?? 0) <= 0 || (intAttr(a.Height) ?? 0) <= 0)
      throw new DslrPackageError('An element has no size.', a.Name)
    const z = intAttr(a.ZIndex) as number
    if (zs.has(z)) throw new DslrPackageError('Two elements share a ZIndex.', String(z))
    zs.add(z)
    if (el.type === 'Image') {
      const path = a.ImagePath ?? ''
      if (!pngs.has(path) || path === PREVIEW_PNG)
        throw new DslrPackageError('An image refers to a file that is not in the template.', path)
      referenced.add(path)
    } else {
      photos++
      const n = intAttr(a.PhotoNumber)
      if (n === null || n < 1 || n > MAX_PHOTO_NUMBER)
        throw new DslrPackageError('A photo slot has an invalid PhotoNumber.', a.PhotoNumber)
      if ((a.ImagePath ?? '') !== '')
        throw new DslrPackageError('A photo slot must not refer to an image.', a.ImagePath)
    }
  }
  if (photos === 0)
    throw new DslrPackageError('A dslrBooth template needs at least one photo slot.')
  for (const p of pngs)
    if (p !== PREVIEW_PNG && !referenced.has(p))
      throw new DslrPackageError('The template contains a file nothing refers to.', p)
  return parsed
}
