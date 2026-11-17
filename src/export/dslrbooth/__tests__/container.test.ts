import { describe, expect, it } from 'vitest'
import {
  compareEntryNames,
  isSafeDslrEntryPath,
  verifyDslrPackage,
  DslrPackageError
} from '../container'
import { encodeTemplateXml, writeTemplateXml, type DslrElement } from '../templateXml'

const enc = new TextEncoder()
const png = enc.encode('png-bytes') // structure checks only; PNG pixels are verified by the main process

function xml(elements: DslrElement[], bom = true): Uint8Array {
  const text = writeTemplateXml({
    root: {
      name: 'T',
      width: 600,
      height: 1800,
      dimensions: 0,
      resolution: 300,
      backgroundColor: '#FFFFFFFF',
      print2PerPage: true,
      lastSavedDate: '01/01/2026 00:00:00',
      id: 'x'.repeat(25),
      originalDevice: 'd'
    },
    elements
  })
  return bom ? encodeTemplateXml(text) : enc.encode(text)
}
const image = (path: string, z: number): DslrElement => ({
  type: 'Image',
  name: path,
  imagePath: path,
  left: 0,
  top: 0,
  width: 600,
  height: 1800,
  zIndex: z
})
const photo = (n: number, z: number): DslrElement => ({
  type: 'Photo',
  name: `Photo ${n}`,
  photoNumber: n,
  left: 10,
  top: 10,
  width: 300,
  height: 200,
  zIndex: z
})
const good = (elements: DslrElement[] = [image('background.png', 0), photo(1, 1)]) => [
  { path: 'template.xml', data: xml(elements) },
  { path: 'preview.png', data: png },
  { path: 'background.png', data: png }
]

describe('verifyDslrPackage', () => {
  it('accepts a complete package', () => {
    expect(verifyDslrPackage(good()).elements).toHaveLength(2)
  })

  it.each([
    ['missing template.xml', good().filter((e) => e.path !== 'template.xml')],
    ['missing preview.png', good().filter((e) => e.path !== 'preview.png')],
    ['an unreferenced image', [...good(), { path: 'extra.png', data: png }]],
    ['a missing referenced image', good([image('nope.png', 0), photo(1, 1)])],
    ['no photo slot', good([image('background.png', 0)])],
    ['PhotoNumber 13', good([image('background.png', 0), photo(13, 1)])],
    ['a duplicate ZIndex', good([image('background.png', 0), photo(1, 0)])],
    ['an image pointing at preview.png', [...good([image('preview.png', 0), photo(1, 1)])]],
    ['a folder entry', [...good(), { path: 'a/b.png', data: png }]],
    ['a duplicate entry (case)', [...good(), { path: 'Background.png', data: png }]]
  ])('rejects %s', (_label, entries) => {
    expect(() => verifyDslrPackage(entries)).toThrow(DslrPackageError)
  })

  it('requires the BOM', () => {
    const entries = good()
    entries[0] = {
      path: 'template.xml',
      data: xml([image('background.png', 0), photo(1, 1)], false)
    }
    expect(() => verifyDslrPackage(entries)).toThrow(/byte order mark/)
  })
})

describe('entry names', () => {
  it('allows flat portable names only', () => {
    expect(isSafeDslrEntryPath('artwork-1.png')).toBe(true)
    expect(isSafeDslrEntryPath('template.xml')).toBe(true)
    expect(isSafeDslrEntryPath('other.xml')).toBe(false)
    expect(isSafeDslrEntryPath('../x.png')).toBe(false)
    expect(isSafeDslrEntryPath('a b.png')).toBe(false)
  })
  it('sorts case-insensitively like the fixtures', () => {
    expect(
      ['template.xml', 'Top-Overlay.png', 'preview.png', '2025_bg.png'].sort(compareEntryNames)
    ).toEqual(['2025_bg.png', 'preview.png', 'template.xml', 'Top-Overlay.png'])
  })
})
