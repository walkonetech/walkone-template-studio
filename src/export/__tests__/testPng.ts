import { deflateSync } from 'node:zlib'
import { crc32 } from '../png'

const u32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typed = Uint8Array.from([...type].map((c) => c.charCodeAt(0)))
  const body = new Uint8Array(typed.length + data.length)
  body.set(typed)
  body.set(data, typed.length)
  return Uint8Array.from([...u32(data.length), ...body, ...u32(crc32(body))])
}

/** A real, decodable RGBA PNG of the given size (solid colour), optionally with a pHYs chunk. Test helper only. */
export function makePng(
  width: number,
  height: number,
  opts: { physPpm?: number } = {}
): Uint8Array {
  const ihdr = Uint8Array.from([...u32(width), ...u32(height), 8, 6, 0, 0, 0])
  const raw = new Uint8Array((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    for (let x = 0; x < width; x++) raw.set([200, 30, 60, 255], y * (width * 4 + 1) + 1 + x * 4)
  }
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr)
  ]
  if (opts.physPpm !== undefined)
    parts.push(chunk('pHYs', Uint8Array.from([...u32(opts.physPpm), ...u32(opts.physPpm), 1])))
  parts.push(chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array()))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Every chunk's type and whether its CRC is correct. */
export function chunkList(png: Uint8Array): { type: string; crcOk: boolean; data: Uint8Array }[] {
  const out: { type: string; crcOk: boolean; data: Uint8Array }[] = []
  let at = 8
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  while (at < png.length) {
    const len = view.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    const crc = view.getUint32(at + 8 + len)
    out.push({
      type,
      crcOk: crc32(png.subarray(at + 4, at + 8 + len)) === crc,
      data: png.subarray(at + 8, at + 8 + len)
    })
    at += 12 + len
  }
  return out
}
