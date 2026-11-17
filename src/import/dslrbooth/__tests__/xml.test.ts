import { describe, expect, it } from 'vitest'
import { parseXml, XML_LIMITS, XmlReadError } from '../xml'

const enc = (s: string): Uint8Array => new TextEncoder().encode(s)

describe('parseXml', () => {
  it('reads the fixture shape: BOM, declaration, CRLF, self-closing elements, attribute order', () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...enc(
        '<?xml version="1.0" encoding="UTF-8"?>\r\n<Template Name="A &amp; B" Width="10">\r\n  <Elements>\r\n    <Photo Name="P" PhotoNumber="1" />\r\n  </Elements>\r\n</Template>'
      )
    ])
    const doc = parseXml(bytes)
    expect(doc.hasBom).toBe(true)
    expect(doc.root.name).toBe('Template')
    expect(doc.root.attributes).toEqual({ Name: 'A & B', Width: '10' })
    expect(doc.root.order).toEqual(['Name', 'Width'])
    const photo = doc.root.children[0]?.children[0]
    expect(photo?.name).toBe('Photo')
    expect(photo?.order).toEqual(['Name', 'PhotoNumber'])
  })

  it('accepts comments, processing instructions, nested elements, text, CDATA and single quotes', () => {
    const doc = parseXml(
      "<!-- c --><R a='1'><!-- x --><X>hi &lt;there&gt; &#65;&#x42;<![CDATA[<raw>]]></X><?pi ok?><Y/></R><!-- end -->"
    )
    expect(doc.hasBom).toBe(false)
    expect(doc.root.attributes.a).toBe('1')
    expect(doc.root.children.map((c) => c.name)).toEqual(['X', 'Y'])
    expect(doc.root.children[0]?.text).toBe('hi <there> AB<raw>')
  })

  it('an unescaped apostrophe inside a double-quoted value is fine (seen in a real file)', () => {
    expect(parseXml(`<T Name="Ramiyah's 13th"/>`).root.attributes.Name).toBe("Ramiyah's 13th")
  })

  it('reads UTF-16 with a BOM', () => {
    const s = '<T Name="é"/>'
    const bytes = new Uint8Array(2 + s.length * 2)
    bytes[0] = 0xff
    bytes[1] = 0xfe
    for (let i = 0; i < s.length; i++) bytes[2 + i * 2] = s.charCodeAt(i)
    expect(parseXml(bytes).root.attributes.Name).toBe('é')
  })

  it.each([
    ['a DTD (no entity expansion, ever)', '<!DOCTYPE T [<!ENTITY x "y">]><T a="&x;"/>'],
    ['an unknown entity', '<T a="&nbsp;"/>'],
    ['a bare ampersand', '<T a="a & b"/>'],
    ['mismatched tags', '<T><A></B></T>'],
    ['a duplicate attribute', '<T a="1" a="2"/>'],
    ['an unterminated element', '<T><A/>'],
    ['two root elements', '<T/><U/>'],
    ['an empty file', '   '],
    ['"<" inside a value', '<T a="<"/>'],
    ['a missing quote', '<T a=1/>'],
    ['invalid UTF-8', new Uint8Array([0x3c, 0x54, 0x20, 0x61, 0x3d, 0x22, 0xff, 0x22, 0x2f, 0x3e])]
  ])('rejects %s', (_label, input) => {
    expect(() => parseXml(input)).toThrow(XmlReadError)
  })

  it('caps nesting depth and element count', () => {
    const deep = '<a>'.repeat(XML_LIMITS.maxDepth + 1) + '</a>'.repeat(XML_LIMITS.maxDepth + 1)
    expect(() => parseXml(deep)).toThrow(/deeply/)
    const many = `<T>${'<x/>'.repeat(XML_LIMITS.maxElements)}</T>`
    expect(() => parseXml(many)).toThrow(/Too many elements/)
  })
})
