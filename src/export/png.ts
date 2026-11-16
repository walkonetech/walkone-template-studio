/**
 * Minimal PNG chunk handling for export (Phase 6A): read the header and record the print density. Pixels are never
 * touched: the bytes Konva/Chromium encoded stay authoritative; only the `pHYs` (physical pixel dimensions) chunk is
 * replaced. Pure (Uint8Array in, Uint8Array out), so it runs in the main process and in unit tests.
 */

export const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const METERS_PER_INCH = 0.0254

let crcTable: Uint32Array | null = null
function table(): Uint32Array {
  if (crcTable) return crcTable
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  crcTable = t
  return t
}

/** CRC-32 (ISO-HDLC), as PNG chunks use it. */
export function crc32(bytes: Uint8Array): number {
  const t = table()
  let c = 0xffffffff
  for (const b of bytes) c = (t[(c ^ b) & 0xff] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const readU32 = (b: Uint8Array, at: number): number =>
  (((b[at] as number) << 24) |
    ((b[at + 1] as number) << 16) |
    ((b[at + 2] as number) << 8) |
    (b[at + 3] as number)) >>>
  0

function writeU32(b: Uint8Array, at: number, v: number): void {
  b[at] = (v >>> 24) & 0xff
  b[at + 1] = (v >>> 16) & 0xff
  b[at + 2] = (v >>> 8) & 0xff
  b[at + 3] = v & 0xff
}

interface Chunk {
  type: string
  /** Offset of the chunk's length field. */
  start: number
  /** Offset just past the chunk's CRC. */
  end: number
  dataStart: number
  length: number
}

function chunks(png: Uint8Array): Chunk[] {
  if (png.length < 8 || PNG_SIGNATURE.some((v, i) => png[i] !== v)) throw new Error('Not a PNG')
  const out: Chunk[] = []
  let at = 8
  while (at + 12 <= png.length) {
    const length = readU32(png, at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    const end = at + 12 + length
    if (end > png.length) throw new Error('Truncated PNG chunk')
    out.push({ type, start: at, end, dataStart: at + 8, length })
    at = end
    if (type === 'IEND') break
  }
  if (out[0]?.type !== 'IHDR' || out[out.length - 1]?.type !== 'IEND')
    throw new Error('Malformed PNG')
  return out
}

export interface PngInfo {
  width: number
  height: number
  bitDepth: number
  /** 6 = RGBA, 2 = RGB, … */
  colorType: number
  /** Pixels per inch recorded in pHYs (rounded), or null when absent / not in metres. */
  dpi: { x: number; y: number } | null
}

export function readPngInfo(png: Uint8Array): PngInfo {
  const list = chunks(png)
  const ihdr = list[0] as Chunk
  const phys = list.find((c) => c.type === 'pHYs')
  let dpi: PngInfo['dpi'] = null
  if (phys && phys.length === 9 && png[phys.dataStart + 8] === 1) {
    dpi = {
      x: Math.round(readU32(png, phys.dataStart) * METERS_PER_INCH),
      y: Math.round(readU32(png, phys.dataStart + 4) * METERS_PER_INCH)
    }
  }
  return {
    width: readU32(png, ihdr.dataStart),
    height: readU32(png, ihdr.dataStart + 4),
    bitDepth: png[ihdr.dataStart + 8] as number,
    colorType: png[ihdr.dataStart + 9] as number,
    dpi
  }
}

/**
 * Returns a copy of `png` whose `pHYs` chunk records `dpi` (pixels per metre, unit = metre), inserted right after IHDR;
 * any existing pHYs is replaced. Image data is copied byte for byte.
 */
export function withPngDensity(png: Uint8Array, dpi: number): Uint8Array {
  if (!Number.isFinite(dpi) || dpi <= 0) throw new RangeError('DPI must be positive')
  const list = chunks(png)
  const ppm = Math.round(dpi / METERS_PER_INCH)
  const phys = new Uint8Array(21)
  writeU32(phys, 0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  writeU32(phys, 8, ppm)
  writeU32(phys, 12, ppm)
  phys[16] = 1 // unit: metre
  writeU32(phys, 17, crc32(phys.subarray(4, 17)))

  const kept = list.filter((c) => c.type !== 'pHYs')
  const size = 8 + kept.reduce((n, c) => n + (c.end - c.start), 0) + phys.length
  const out = new Uint8Array(size)
  out.set(PNG_SIGNATURE, 0)
  let at = 8
  for (const c of kept) {
    out.set(png.subarray(c.start, c.end), at)
    at += c.end - c.start
    if (c.type === 'IHDR') {
      out.set(phys, at)
      at += phys.length
    }
  }
  return out
}
