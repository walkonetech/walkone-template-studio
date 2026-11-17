import { describe, expect, it } from 'vitest'
import {
  encodeTemplateXml,
  escapeAttr,
  parseTemplateXml,
  writeTemplateXml,
  type DslrTemplate
} from '../templateXml'

const template = (): DslrTemplate => ({
  root: {
    name: 'Mya & Myka’s "Sweet" 16',
    width: 600,
    height: 1800,
    dimensions: 0,
    resolution: 300,
    backgroundColor: '#FFFFFFFF',
    print2PerPage: true,
    lastSavedDate: '11/16/2026 14:05:09',
    id: 'AbCdEfGhIjKlMnOpQrStUvWxY',
    originalDevice: 'WalkOneTemplateStudio'
  },
  elements: [
    {
      type: 'Image',
      name: 'Background',
      imagePath: 'background.png',
      left: 0,
      top: 0,
      width: 600,
      height: 1800,
      zIndex: 0
    },
    {
      type: 'Photo',
      name: 'Photo 1',
      photoNumber: 1,
      left: 30,
      top: 40,
      width: 540,
      height: 360,
      zIndex: 1,
      rotation: 0
    },
    {
      type: 'Photo',
      name: 'Photo 2',
      photoNumber: 2,
      left: 30,
      top: 420,
      width: 540,
      height: 360,
      zIndex: 2,
      rotation: -3
    },
    {
      type: 'Image',
      name: 'Artwork',
      imagePath: 'artwork-1.png',
      left: 0,
      top: 0,
      width: 600,
      height: 1800,
      zIndex: 3
    }
  ]
})

describe('writeTemplateXml', () => {
  it('writes the fixture text format exactly: declaration, CRLF, attribute order, descending ZIndex, " />"', () => {
    const xml = writeTemplateXml(template())
    const lines = xml.split('\r\n')
    expect(xml.includes('\n') && !/[^\r]\n/.test(xml)).toBe(true) // only CRLF
    expect(xml.endsWith('</Template>')).toBe(true) // no trailing line break, as in every fixture
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>')
    expect(lines[1]).toBe(
      '<Template Name="Mya &amp; Myka’s &quot;Sweet&quot; 16" Width="600" Height="1800" Dimensions="0" Resolution="300" BackgroundColor="#FFFFFFFF" print_2_per_page="True" PrintToSecondaryPrinter="False" LastSavedDate="11/16/2026 14:05:09" Id="AbCdEfGhIjKlMnOpQrStUvWxY" IsLegacy="True" OriginalDevice="WalkOneTemplateStudio">'
    )
    expect(lines[2]).toBe('  <Elements>')
    expect(lines[3]).toBe(
      '    <Image Name="Artwork" Opacity="100" ShadowEnabled="False" ShadowColor="#FF000000" ShadowDepth="10" ShadowRadius="20" ShadowDirection="-45" Width="600" Height="1800" Top="0" Left="0" ImagePath="artwork-1.png" KeepAspect="True" Thickness="0" StrokeColor="#FF000000" ZIndex="3" IsLocked="False" />'
    )
    expect(lines[4]).toBe(
      '    <Photo Name="Photo 2" Opacity="100" ShadowEnabled="False" ShadowColor="#FF000000" ShadowDepth="10" ShadowRadius="20" ShadowDirection="-45" Width="540" Height="360" Top="420" Left="30" ImagePath="" KeepAspect="True" Thickness="0" StrokeColor="#FF000000" PhotoNumber="2" ZIndex="2" Rotation="-3" IsLocked="False" />'
    )
    // Rotation 0 is omitted
    expect(lines[5]).not.toContain('Rotation')
    expect(lines.at(-2)).toBe('  </Elements>')
    expect(lines.at(-1)).toBe('</Template>')
  })

  it('refuses non-integer geometry (callers round deterministically)', () => {
    const t = template()
    ;(t.elements[1] as { left: number }).left = 30.5
    expect(() => writeTemplateXml(t)).toThrow(RangeError)
  })

  it('escapes attribute values', () => {
    expect(escapeAttr(`a&b<c>"d"\n`)).toBe('a&amp;b&lt;c&gt;&quot;d&quot;&#xA;')
    expect(escapeAttr("Ramiyah's")).toBe("Ramiyah's") // apostrophes stay as in the fixtures
  })
})

describe('encodeTemplateXml / parseTemplateXml', () => {
  it('stores UTF-8 with a BOM and reads back every attribute in order', () => {
    const bytes = encodeTemplateXml(writeTemplateXml(template()))
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const parsed = parseTemplateXml(bytes)
    expect(parsed.hasBom).toBe(true)
    expect(parsed.root.Name).toBe('Mya & Myka’s "Sweet" 16')
    expect(parsed.rootOrder).toEqual([
      'Name',
      'Width',
      'Height',
      'Dimensions',
      'Resolution',
      'BackgroundColor',
      'print_2_per_page',
      'PrintToSecondaryPrinter',
      'LastSavedDate',
      'Id',
      'IsLegacy',
      'OriginalDevice'
    ])
    expect(parsed.elements.map((e) => `${e.type}:${e.attributes.ZIndex}`)).toEqual([
      'Image:3',
      'Photo:2',
      'Photo:1',
      'Image:0'
    ])
    expect(parsed.elements[1]?.order).toEqual([
      'Name',
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
  })

  it('reads a fixture-style text without a BOM or with LF line endings', () => {
    const lf = writeTemplateXml(template()).replace(/\r\n/g, '\n')
    const parsed = parseTemplateXml(lf)
    expect(parsed.hasBom).toBe(false)
    expect(parsed.elements).toHaveLength(4)
  })

  it('rejects anything that is not the flat template format', () => {
    expect(() =>
      parseTemplateXml('<Template><Elements><Image a="1"></Image></Elements></Template>')
    ).toThrow(SyntaxError)
    expect(() => parseTemplateXml('<Other/>')).toThrow(SyntaxError)
    expect(() =>
      parseTemplateXml('<Template><Elements><Image a="1" a="2" /></Elements></Template>')
    ).toThrow(SyntaxError)
  })
})
