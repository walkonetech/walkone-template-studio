import { crc32, deflateSync } from 'node:zlib'

/** Real (decodable) PNG built from raw pixels, plus header-faithful JPEG/WebP/SVG stand-ins for header parsing tests. */

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

export interface PngOptions {
  width: number
  height: number
  /** 0 grayscale, 2 RGB, 3 palette, 4 gray+alpha, 6 RGBA */
  colorType?: 0 | 2 | 3 | 4 | 6
  /** Add a tRNS chunk (palette/color-key transparency). */
  trns?: boolean
  /** RGBA fill for types 2/6 (alpha ignored for 2). */
  rgba?: [number, number, number, number]
}

export function makePng(o: PngOptions): Buffer {
  const colorType = o.colorType ?? 6
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(o.width, 0)
  ihdr.writeUInt32BE(o.height, 4)
  ihdr[8] = 8
  ihdr[9] = colorType
  const [r, g, b, a] = o.rgba ?? [200, 30, 30, 255]
  const px =
    colorType === 6 ? [r, g, b, a] : colorType === 2 ? [r, g, b] : colorType === 4 ? [r, a] : [r]
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(o.width).fill(px).flat())])
  const raw = Buffer.concat(Array.from({ length: o.height }, () => row))
  expectChannels(px.length, channels)
  const chunks = [pngChunk('IHDR', ihdr)]
  if (colorType === 3) chunks.push(pngChunk('PLTE', Buffer.from([r, g, b])))
  if (o.trns) chunks.push(pngChunk('tRNS', Buffer.from(colorType === 3 ? [0] : [0, 0])))
  chunks.push(pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0)))
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks])
}
function expectChannels(a: number, b: number): void {
  if (a !== b) throw new Error('fixture channel mismatch')
}

/** Header-valid JPEG: SOI, one SOF0 frame header, EOI. (Not a decodable picture; the importer reads headers only.) */
export function makeJpeg(width: number, height: number): Buffer {
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x01,
    0x01,
    0x11,
    0x00
  ])
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46]),
    sof,
    Buffer.from([0xff, 0xd9])
  ])
}

function riff(chunk: Buffer): Buffer {
  const head = Buffer.alloc(12)
  head.write('RIFF', 0, 'ascii')
  head.writeUInt32LE(4 + chunk.length, 4)
  head.write('WEBP', 8, 'ascii')
  return Buffer.concat([head, chunk])
}
function webpChunk(fourcc: string, payload: Buffer): Buffer {
  const h = Buffer.alloc(8)
  h.write(fourcc, 0, 'ascii')
  h.writeUInt32LE(payload.length, 4)
  return Buffer.concat([h, payload, payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)])
}
export function makeWebpLossy(width: number, height: number): Buffer {
  const p = Buffer.alloc(10)
  p.set([0x10, 0x00, 0x00, 0x9d, 0x01, 0x2a], 0)
  p.writeUInt16LE(width, 6)
  p.writeUInt16LE(height, 8)
  return riff(webpChunk('VP8 ', p))
}
export function makeWebpLossless(width: number, height: number, alpha: boolean): Buffer {
  const p = Buffer.alloc(5)
  p[0] = 0x2f
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14) | ((alpha ? 1 : 0) << 28)
  p.writeUInt32LE(bits >>> 0, 1)
  return riff(webpChunk('VP8L', p))
}
export function makeWebpExtended(width: number, height: number, alpha: boolean): Buffer {
  const p = Buffer.alloc(10)
  p[0] = alpha ? 0x10 : 0
  p.writeUIntLE(width - 1, 4, 3)
  p.writeUIntLE(height - 1, 7, 3)
  return riff(webpChunk('VP8X', p))
}

export const SAFE_SVG =
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="200" height="100" fill="url(#g)"/><use href="#g"/></svg>'
export const svg = (inner: string, attrs = 'width="10" height="10"'): Buffer =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`)
