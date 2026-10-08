import { describe, expect, it } from 'vitest'
import { PersistenceError } from '../errors'
import { MAX_IMAGE_PIXELS, findSvgViolation, inspectImage } from '../imageInspect'
import {
  SAFE_SVG,
  makeJpeg,
  makePng,
  makeWebpExtended,
  makeWebpLossless,
  makeWebpLossy,
  svg
} from './imageFixtures'

const codeOf = (fn: () => unknown): string => {
  try {
    fn()
  } catch (e) {
    return e instanceof PersistenceError ? e.code : String(e)
  }
  return 'no error'
}

describe('format detection and metadata', () => {
  it('PNG: type, size and alpha from the headers', () => {
    expect(inspectImage(makePng({ width: 7, height: 5, colorType: 6 }))).toMatchObject({
      mediaType: 'image/png',
      extension: 'png',
      pixelWidth: 7,
      pixelHeight: 5,
      hasAlpha: true
    })
    expect(inspectImage(makePng({ width: 4, height: 4, colorType: 2 })).hasAlpha).toBe(false)
    expect(inspectImage(makePng({ width: 4, height: 4, colorType: 4 })).hasAlpha).toBe(true)
  })

  it('PNG: tRNS transparency (palette and color-key) counts as alpha', () => {
    expect(inspectImage(makePng({ width: 2, height: 2, colorType: 3, trns: true })).hasAlpha).toBe(
      true
    )
    expect(inspectImage(makePng({ width: 2, height: 2, colorType: 3 })).hasAlpha).toBe(false)
    expect(inspectImage(makePng({ width: 2, height: 2, colorType: 2, trns: true })).hasAlpha).toBe(
      true
    )
  })

  it('JPEG: size from the SOF header, never alpha (JPG and JPEG share one format)', () => {
    expect(inspectImage(makeJpeg(640, 480))).toMatchObject({
      mediaType: 'image/jpeg',
      extension: 'jpg',
      pixelWidth: 640,
      pixelHeight: 480,
      hasAlpha: false
    })
  })

  it('WebP: lossy, lossless (alpha bit) and extended (alpha flag)', () => {
    expect(inspectImage(makeWebpLossy(300, 200))).toMatchObject({
      mediaType: 'image/webp',
      pixelWidth: 300,
      pixelHeight: 200,
      hasAlpha: false
    })
    expect(inspectImage(makeWebpLossless(33, 17, true))).toMatchObject({
      pixelWidth: 33,
      pixelHeight: 17,
      hasAlpha: true
    })
    expect(inspectImage(makeWebpLossless(33, 17, false)).hasAlpha).toBe(false)
    expect(inspectImage(makeWebpExtended(1000, 2000, true))).toMatchObject({
      pixelWidth: 1000,
      pixelHeight: 2000,
      hasAlpha: true
    })
  })

  it('SVG: intrinsic size from width/height, viewBox, or one plus a viewBox; alpha unknown', () => {
    expect(inspectImage(Buffer.from(SAFE_SVG))).toMatchObject({
      mediaType: 'image/svg+xml',
      extension: 'svg',
      pixelWidth: 200,
      pixelHeight: 100,
      hasAlpha: undefined
    })
    expect(inspectImage(svg('', 'viewBox="0 0 30 60"'))).toMatchObject({
      pixelWidth: 30,
      pixelHeight: 60
    })
    expect(inspectImage(svg('', 'width="60" viewBox="0 0 30 15"'))).toMatchObject({
      pixelWidth: 60,
      pixelHeight: 30
    })
    expect(inspectImage(svg('', 'width="1in" height="1in"'))).toMatchObject({
      pixelWidth: 96,
      pixelHeight: 96
    })
  })

  it('decides by content, not extension, and rejects unsupported formats', () => {
    expect(codeOf(() => inspectImage(Buffer.from('%PDF-1.7 hello')))).toBe('unsupported-format')
    expect(codeOf(() => inspectImage(Buffer.from('GIF89a......')))).toBe('unsupported-format')
    expect(codeOf(() => inspectImage(Buffer.from('8BPS....psd')))).toBe('unsupported-format')
    expect(codeOf(() => inspectImage(Buffer.from('just some text')))).toBe('unsupported-format')
  })

  it('damaged files fail as decode-failed with a user-safe message', () => {
    const png = makePng({ width: 10, height: 10 })
    expect(codeOf(() => inspectImage(png.subarray(0, png.length - 20)))).toBe('decode-failed')
    expect(codeOf(() => inspectImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9])))).toBe('decode-failed')
    expect(codeOf(() => inspectImage(new Uint8Array()))).toBe('decode-failed')
    expect(codeOf(() => inspectImage(svg('', 'xmlns:x="y"')))).toBe('decode-failed') // no size at all
    try {
      inspectImage(png.subarray(0, 30))
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\/|\\|IHDR|offset/)
    }
  })

  it('refuses absurd pixel counts (decompression-bomb guard)', () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 1
    expect(codeOf(() => inspectImage(makeWebpExtended(side, side, false)))).toBe('image-too-large')
  })
})

describe('SVG safety policy: reject, never silently rewrite', () => {
  const unsafe: [string, string][] = [
    ['script element', '<script>alert(1)</script>'],
    [
      'foreignObject',
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'
    ],
    ['event handler', '<rect width="1" height="1" onload="x()"/>'],
    ['javascript: URL', '<a href="javascript:alert(1)"><rect width="1" height="1"/></a>'],
    ['external href', '<image href="https://example.com/a.png" width="1" height="1"/>'],
    ['relative file href', '<image xlink:href="../secret.png" width="1" height="1"/>'],
    ['external CSS url()', '<rect style="fill:url(http://example.com/x)" width="1" height="1"/>'],
    ['css @import', '<style>@import "https://example.com/a.css";</style>'],
    ['iframe', '<iframe src="x"></iframe>'],
    ['html data URL', '<image href="data:text/html;base64,PGI+" width="1" height="1"/>'],
    [
      'svg data URL',
      '<image href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" width="1" height="1"/>'
    ]
  ]
  for (const [name, inner] of unsafe) {
    it(`rejects ${name}`, () => {
      expect(codeOf(() => inspectImage(svg(inner)))).toBe('unsafe-svg')
    })
  }

  it('rejects entity declarations and stylesheet processing instructions', () => {
    const entity = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`
    expect(codeOf(() => inspectImage(Buffer.from(entity)))).toBe('unsafe-svg')
    const pi = `<?xml-stylesheet href="x.css"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`
    expect(codeOf(() => inspectImage(Buffer.from(pi)))).toBe('unsafe-svg')
  })

  it('accepts ordinary vector art: gradients, #id references, embedded raster data URLs, plain DOCTYPE', () => {
    expect(findSvgViolation(SAFE_SVG)).toBeNull()
    const embedded = svg('<image href="data:image/png;base64,iVBORw0KGgo=" width="1" height="1"/>')
    expect(codeOf(() => inspectImage(embedded))).toBe('no error')
    const doctype = Buffer.from(
      `<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>`
    )
    expect(codeOf(() => inspectImage(doctype))).toBe('no error')
    expect(
      codeOf(() => inspectImage(svg('<rect style="fill:url(#g)" width="1" height="1"/>')))
    ).toBe('no error')
  })

  it('does not mistake legitimate element names for forbidden ones', () => {
    expect(
      findSvgViolation('<svg><linearGradient id="a"/><line x1="0"/><set attributeName="x"/></svg>')
    ).toBeNull()
  })

  it('error messages are user-safe and explain what to do', () => {
    try {
      inspectImage(svg('<script>x</script>'))
    } catch (e) {
      expect((e as PersistenceError).message).toMatch(/not imported/)
      expect((e as PersistenceError).message).not.toMatch(/<script/)
    }
  })
})
