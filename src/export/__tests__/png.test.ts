import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, readPngInfo, withPngDensity } from '../png'
import { chunkList, makePng } from './testPng'

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('readPngInfo', () => {
  it('reads size, depth and colour type', () => {
    const info = readPngInfo(makePng(7, 3))
    expect(info).toEqual({ width: 7, height: 3, bitDepth: 8, colorType: 6, dpi: null })
  })
  it('rejects data that is not a PNG', () => {
    expect(() => readPngInfo(new TextEncoder().encode('GIF89a not a png at all'))).toThrow(
      /Not a PNG/
    )
  })
  it('rejects a truncated PNG', () => {
    const png = makePng(4, 4)
    expect(() => readPngInfo(png.subarray(0, png.length - 20))).toThrow()
  })
})

describe('withPngDensity', () => {
  it('records 300 DPI in a pHYs chunk right after IHDR with valid CRCs', () => {
    const out = withPngDensity(makePng(5, 5), 300)
    const list = chunkList(out)
    expect(list.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])
    expect(list.every((c) => c.crcOk)).toBe(true)
    expect(readPngInfo(out).dpi).toEqual({ x: 300, y: 300 })
  })
  it('replaces an existing pHYs instead of adding a second one', () => {
    const out = withPngDensity(makePng(5, 5, { physPpm: 2835 }), 600)
    const types = chunkList(out).map((c) => c.type)
    expect(types.filter((t) => t === 'pHYs')).toHaveLength(1)
    expect(readPngInfo(out).dpi).toEqual({ x: 600, y: 600 })
  })
  it('leaves the image data byte-identical', () => {
    const src = makePng(9, 4)
    const idat = (png: Uint8Array): Uint8Array =>
      chunkList(png).find((c) => c.type === 'IDAT')!.data
    const out = withPngDensity(src, 300)
    expect(Buffer.from(idat(out)).equals(Buffer.from(idat(src)))).toBe(true)
    expect(inflateSync(idat(out)).length).toBe((9 * 4 + 1) * 4)
  })
  it('is deterministic', () => {
    const src = makePng(3, 3)
    expect(
      Buffer.from(withPngDensity(src, 300)).equals(Buffer.from(withPngDensity(src, 300)))
    ).toBe(true)
  })
  it('rejects a non-positive DPI', () => {
    expect(() => withPngDensity(makePng(2, 2), 0)).toThrow(RangeError)
  })
})
