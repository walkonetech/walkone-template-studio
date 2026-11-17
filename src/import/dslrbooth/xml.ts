/**
 * A small, strict-but-tolerant XML reader for dslrBooth `template.xml` (DSLR Booth importer). It accepts what an XML
 * file from any dslrBooth version could reasonably contain — a BOM, the declaration, comments, nested or self-closing
 * elements, text, CDATA, single or double quotes — so the importer can report unknown structure instead of failing.
 *
 * Security: no DTDs. `<!DOCTYPE` is rejected outright (no entity expansion, no external entities); only the five
 * predefined entities and numeric character references are decoded. Depth, element and attribute counts are capped.
 */

export interface XmlElement {
  name: string
  attributes: Record<string, string>
  /** Attribute names in file order. */
  order: string[]
  children: XmlElement[]
  /** Concatenated, trimmed character data directly inside this element ('' when none). */
  text: string
}

export interface XmlDocument {
  hasBom: boolean
  root: XmlElement
}

export const XML_LIMITS = { maxDepth: 32, maxElements: 20_000, maxAttributes: 256 } as const

export class XmlReadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XmlReadError'
  }
}

const NAME = /[A-Za-z_][\w.:-]*/y

function decodeEntities(v: string): string {
  return v.replace(/&([a-zA-Z]+|#x[0-9a-fA-F]+|#\d+);|&/g, (m, body: string | undefined) => {
    if (!body) throw new XmlReadError('A bare "&" is not allowed in XML text')
    if (body.startsWith('#x') || body.startsWith('#')) {
      const code = body.startsWith('#x') ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff)
        throw new XmlReadError(`Invalid character reference ${m}`)
      return String.fromCodePoint(code)
    }
    const named = ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[
      body
    ]
    if (named === undefined) throw new XmlReadError(`Unknown entity ${m}`)
    return named
  })
}

/** Text from bytes: UTF-8 (with or without BOM), or UTF-16 when it starts with a UTF-16 BOM. */
export function decodeXmlBytes(bytes: Uint8Array): { text: string; hasBom: boolean } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return {
      text: new TextDecoder('utf-16le', { fatal: true }).decode(bytes.subarray(2)),
      hasBom: true
    }
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return {
      text: new TextDecoder('utf-16be', { fatal: true }).decode(bytes.subarray(2)),
      hasBom: true
    }
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true }).decode(hasBom ? bytes.subarray(3) : bytes),
      hasBom
    }
  } catch {
    throw new XmlReadError('The file is not valid UTF-8 text')
  }
}

export function parseXml(input: Uint8Array | string): XmlDocument {
  let hasBom = false
  let s: string
  if (typeof input === 'string') {
    s = input
    if (s.charCodeAt(0) === 0xfeff) {
      hasBom = true
      s = s.slice(1)
    }
  } else {
    ;({ text: s, hasBom } = decodeXmlBytes(input))
  }

  let pos = 0
  let elementCount = 0
  const fail = (msg: string): never => {
    const line = s.slice(0, pos).split('\n').length
    throw new XmlReadError(`${msg} (line ${line})`)
  }
  const startsWith = (t: string): boolean => s.startsWith(t, pos)
  const skipWs = (): void => {
    while (pos < s.length && /\s/.test(s[pos] as string)) pos++
  }
  const readName = (): string => {
    NAME.lastIndex = pos
    const m = NAME.exec(s)
    if (!m) return fail('Expected a name')
    pos = NAME.lastIndex
    return m[0]
  }
  const skipUntil = (end: string, what: string): void => {
    const i = s.indexOf(end, pos)
    if (i < 0) fail(`Unterminated ${what}`)
    pos = i + end.length
  }
  /** Comments, processing instructions and whitespace between elements. Rejects DTDs. */
  const skipMisc = (): void => {
    for (;;) {
      skipWs()
      if (startsWith('<!--')) skipUntil('-->', 'comment')
      else if (startsWith('<?')) skipUntil('?>', 'processing instruction')
      else if (startsWith('<!DOCTYPE') || startsWith('<!doctype'))
        fail('Document type declarations are not allowed')
      else return
    }
  }

  const readElement = (depth: number): XmlElement => {
    if (depth > XML_LIMITS.maxDepth) fail('Elements are nested too deeply')
    if (++elementCount > XML_LIMITS.maxElements) fail('Too many elements')
    if (s[pos] !== '<') fail('Expected an element')
    pos++
    const name = readName()
    const attributes: Record<string, string> = {}
    const order: string[] = []
    for (;;) {
      const before = pos
      skipWs()
      if (startsWith('/>')) {
        pos += 2
        return { name, attributes, order, children: [], text: '' }
      }
      if (s[pos] === '>') {
        pos++
        break
      }
      if (pos === before) fail('Expected whitespace between attributes')
      const key = readName()
      skipWs()
      if (s[pos] !== '=') fail(`Expected "=" after ${key}`)
      pos++
      skipWs()
      const q = s[pos]
      if (q !== '"' && q !== "'") fail(`Expected a quoted value for ${key}`)
      const end = s.indexOf(q as string, pos + 1)
      if (end < 0) fail(`Unterminated value for ${key}`)
      const raw = s.slice(pos + 1, end)
      if (raw.includes('<')) fail(`"<" is not allowed in the value of ${key}`)
      if (Object.prototype.hasOwnProperty.call(attributes, key)) fail(`Duplicate attribute ${key}`)
      if (order.length >= XML_LIMITS.maxAttributes) fail('Too many attributes')
      attributes[key] = decodeEntities(raw)
      order.push(key)
      pos = end + 1
    }
    const children: XmlElement[] = []
    let text = ''
    for (;;) {
      if (pos >= s.length) fail(`Missing </${name}>`)
      if (startsWith('</')) {
        pos += 2
        const close = readName()
        if (close !== name) fail(`Expected </${name}> but found </${close}>`)
        skipWs()
        if (s[pos] !== '>') fail(`Malformed </${name}>`)
        pos++
        return { name, attributes, order, children, text: text.trim() }
      }
      if (startsWith('<!--')) skipUntil('-->', 'comment')
      else if (startsWith('<![CDATA[')) {
        const end = s.indexOf(']]>', pos)
        if (end < 0) fail('Unterminated CDATA section')
        text += s.slice(pos + 9, end)
        pos = end + 3
      } else if (startsWith('<?')) skipUntil('?>', 'processing instruction')
      else if (startsWith('<!')) fail('Declarations are not allowed inside elements')
      else if (s[pos] === '<') children.push(readElement(depth + 1))
      else {
        const next = s.indexOf('<', pos)
        const end = next < 0 ? s.length : next
        text += decodeEntities(s.slice(pos, end))
        pos = end
      }
    }
  }

  skipMisc()
  if (pos >= s.length) fail('The file is empty')
  const root = readElement(1)
  skipMisc()
  if (pos < s.length) fail('Unexpected content after the root element')
  return { hasBom, root }
}
