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
const SHADOW_ATTRIBUTES = [
  'ShadowEnabled',
  'ShadowColor',
  'ShadowDepth',
  'ShadowRadius',
  'ShadowDirection'
]

export interface DslrElementIn {
  kind: 'photo' | 'image'
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
      if (el.name !== 'Image' && el.name !== 'Photo') {
        unknown.push(toJsonish(el))
        continue
      }
      const a = el.attributes
      const kind = el.name === 'Photo' ? 'photo' : 'image'
      const extra: Record<string, string> = {}
      for (const key of el.order)
        if (!KNOWN_ELEMENT_ATTRIBUTES.has(key)) extra[key] = a[key] as string
      if (el.children.length > 0 || el.text !== '')
        extra['#content'] = JSON.stringify(el.children.map(toJsonish)).slice(0, 4000)
      const shadowEnabled = bool(a.ShadowEnabled, false)
      if (shadowEnabled)
        for (const key of SHADOW_ATTRIBUTES) if (a[key] !== undefined) extra[key] = a[key] as string
      const keepAspect = bool(a.KeepAspect, true)
      if (kind === 'photo' && !keepAspect) extra.KeepAspect = a.KeepAspect as string
      const opacityRaw = num(a.Opacity)
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
        (k) => !k.startsWith('Shadow') && k !== 'KeepAspect' && k !== '#content'
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
