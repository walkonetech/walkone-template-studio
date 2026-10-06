import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { createProject, serializeProject, type TemplateProject } from '../../domain'
import { RecentProjectsStore } from '../recents'
import { ProjectService } from '../service'
import type { InitialAsset } from '../session'

const dirs: string[] = []

export async function tempDir(prefix = 'wts-test-'): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix))
  dirs.push(d)
  return d
}

/** Registers cleanup of every temp directory created through tempDir(). */
export function useTempDirCleanup(): void {
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
  })
}

export interface Env {
  root: string
  service: ProjectService
  recents: RecentProjectsStore
  sessionsRoot: string
}

/** A service instance with its own sessions dir and recents file. Use two to simulate two machines. */
export async function makeEnv(
  root?: string,
  fsOps?: ConstructorParameters<typeof ProjectService>[0]['fsOps']
): Promise<Env> {
  const r = root ?? (await tempDir())
  const sessionsRoot = join(r, 'sessions')
  const recents = new RecentProjectsStore(join(r, 'recents.json'))
  const service = new ProjectService({ sessionsRoot, recents, ...(fsOps ? { fsOps } : {}) })
  return { root: r, service, recents, sessionsRoot }
}

export const PNG_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)
export const PNG_B = Buffer.concat([PNG_A, Buffer.from('extra-bytes-to-differ')])

export const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

export interface SampleAsset extends InitialAsset {
  id: string
}

/** A valid project referencing the given assets with one image layer each. */
export function sampleProject(
  assets: SampleAsset[] = [],
  extra?: (p: TemplateProject) => void
): TemplateProject {
  const p = createProject({
    name: 'Persist Test',
    design: 'photo-4x6-portrait-300',
    now: '2026-01-01T00:00:00.000Z'
  })
  assets.forEach((a, i) => {
    p.assets.push({
      id: a.id,
      filename: a.path.split('/').pop() ?? 'x',
      mediaType: 'image/png',
      path: a.path,
      byteSize: a.data.length,
      sha256: sha(a.data),
      source: { kind: 'upload' }
    })
    p.layers.push({
      id: `layer-${a.id}`,
      type: 'image',
      name: `Layer ${i}`,
      x: i === 0 ? 0 : -10 * i,
      y: 5,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: i,
      visible: true,
      locked: false,
      assetId: a.id,
      role: 'graphic',
      fit: 'cover'
    })
  })
  extra?.(p)
  return p
}

export const ASSETS: SampleAsset[] = [
  { id: 'a1', path: 'assets/background.png', data: PNG_A },
  { id: 'a2', path: 'assets/logo.png', data: PNG_B }
]

// ---------- Raw ZIP builder (STORE method) for crafting hostile/malformed archives ----------

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

export interface RawEntry {
  name: string
  data?: Uint8Array | string
  /** Unix mode placed in the high 16 bits of external attributes (e.g. 0o120777 for a symlink). */
  unixMode?: number
}

export function rawZip(entries: RawEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const data = Buffer.from(e.data ?? '')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, data)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE((3 << 8) | 20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0x0800, 8)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(data.length, 24)
    cd.writeUInt16LE(name.length, 28)
    cd.writeUInt32LE(((e.unixMode ?? 0o100644) << 16) >>> 0, 38)
    cd.writeUInt32LE(offset, 42)
    central.push(cd, name)
    offset += local.length + name.length + data.length
  }
  const cdBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(cdBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cdBuf, end])
}

export async function writeRawPackage(path: string, entries: RawEntry[]): Promise<void> {
  await writeFile(path, rawZip(entries))
}

export const manifestOf = (p: TemplateProject): string => serializeProject(p)
