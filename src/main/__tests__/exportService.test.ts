import { promises as fs } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import yauzl from 'yauzl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readPngInfo } from '../../export/png'
import { makePng } from '../../export/__tests__/testPng'
import { encodeTemplateXml, writeTemplateXml } from '../../export/dslrbooth/templateXml'
import { ExportService, type ExportDeps } from '../exportService'
import type { ExportFile, ExportWriteResult } from '../../shared/ipc'
import type { IpcResult } from '../../shared/persistence'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wts-export-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function make(folder: () => string | null = () => dir) {
  const showItemInFolder = vi.fn()
  const chooseFolder = vi.fn<ExportDeps['chooseFolder']>(async () => folder())
  const service = new ExportService({ chooseFolder, showItemInFolder })
  return { service, showItemInFolder, chooseFolder }
}

async function destination(service: ExportService): Promise<string> {
  const r = await service.chooseDestination(null)
  if (r.status !== 'ok') throw new Error('no destination')
  return r.value.destinationId
}

const png = (name: string, w = 4, h = 6, dpi = 300): ExportFile => ({
  kind: 'png',
  name,
  data: makePng(w, h),
  width: w,
  height: h,
  dpi
})

function ok<T>(r: IpcResult<T>): T {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return r.value
}
const written = (r: IpcResult<ExportWriteResult>) => {
  const v = ok(r)
  if (v.outcome !== 'written') throw new Error('expected written')
  return v
}

function zipEntries(path: string): Promise<Map<string, Buffer>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err)
      const out = new Map<string, Buffer>()
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (e, stream) => {
          if (e || !stream) return reject(e)
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            out.set(entry.fileName, Buffer.concat(chunks))
            zip.readEntry()
          })
        })
      })
      zip.on('end', () => resolve(out))
      zip.readEntry()
    })
  })
}

describe('ExportService destinations', () => {
  it('returns an opaque id and the folder name, never the path', async () => {
    const { service } = make()
    const v = ok(await service.chooseDestination(null))
    expect(v.destinationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(v.folderName).toBe(dir.split('/').pop())
    expect(JSON.stringify(v)).not.toContain(dir)
  })
  it('treats a dismissed picker as cancelled', async () => {
    const { service } = make(() => null)
    expect(await service.chooseDestination(null)).toEqual({ status: 'cancelled' })
  })
  it('remembers the last folder for the next picker', async () => {
    const { service, chooseFolder } = make()
    await service.chooseDestination(null)
    await service.chooseDestination(null)
    expect(chooseFolder.mock.calls[1]?.[1]).toBe(dir)
  })
  it('refuses an unknown destination id', async () => {
    const { service } = make()
    const r = await service.write({
      destinationId: 'nope',
      files: [png('a-print.png')],
      onConflict: 'ask'
    })
    expect(r.status).toBe('error')
  })
})

describe('ExportService.write', () => {
  it('writes a PNG atomically with the print density recorded', async () => {
    const { service } = make()
    const id = await destination(service)
    const v = written(
      await service.write({
        destinationId: id,
        files: [png('Event-print.png', 4, 6, 300)],
        onConflict: 'ask'
      })
    )
    expect(v.written).toEqual([
      expect.objectContaining({ requested: 'Event-print.png', name: 'Event-print.png' })
    ])
    expect(v.failed).toEqual([])
    const bytes = new Uint8Array(await fs.readFile(join(dir, 'Event-print.png')))
    expect(readPngInfo(bytes)).toMatchObject({ width: 4, height: 6, dpi: { x: 300, y: 300 } })
    expect((await fs.readdir(dir)).filter((n) => n.startsWith('.'))).toEqual([])
  })
  it('refuses a PNG whose pixel size differs from what was rendered for, writing nothing', async () => {
    const { service } = make()
    const id = await destination(service)
    const bad = { ...png('a-print.png'), width: 1200 } as ExportFile
    const r = await service.write({
      destinationId: id,
      files: [png('b-print.png'), bad],
      onConflict: 'ask'
    })
    expect(r).toMatchObject({ status: 'error', error: { code: 'export-invalid-output' } })
    expect(await fs.readdir(dir)).toEqual([])
  })
  it('refuses bytes that are not a PNG', async () => {
    const { service } = make()
    const id = await destination(service)
    const fake = { ...png('a-print.png'), data: new TextEncoder().encode('<svg/>') } as ExportFile
    expect(
      await service.write({ destinationId: id, files: [fake], onConflict: 'ask' })
    ).toMatchObject({
      status: 'error',
      error: { code: 'export-invalid-output' }
    })
  })
  it.each(['../evil.png', 'sub/x.png', '.hidden.png', 'x.exe', 'CON.png'])(
    'refuses the unsafe name %s',
    async (name) => {
      const { service } = make()
      const id = await destination(service)
      const r = await service.write({
        destinationId: id,
        files: [png(name)],
        onConflict: 'replace'
      })
      expect(r.status).toBe('error')
      expect(await fs.readdir(dir)).toEqual([])
    }
  )
  it('refuses two outputs with the same name (case-insensitive)', async () => {
    const { service } = make()
    const id = await destination(service)
    const r = await service.write({
      destinationId: id,
      files: [png('a.png'), png('A.png')],
      onConflict: 'replace'
    })
    expect(r.status).toBe('error')
  })
  it('reports conflicts first and writes nothing when asked to', async () => {
    const { service } = make()
    await fs.writeFile(join(dir, 'Event-print.png'), 'old')
    const id = await destination(service)
    const r = ok(
      await service.write({
        destinationId: id,
        files: [png('Event-print.png'), png('Event-design.png')],
        onConflict: 'ask'
      })
    )
    expect(r).toEqual({ outcome: 'conflict', existing: ['Event-print.png'] })
    expect(await fs.readFile(join(dir, 'Event-print.png'), 'utf8')).toBe('old')
    expect(await fs.readdir(dir)).toEqual(['Event-print.png'])
  })
  it('replaces existing files when told to', async () => {
    const { service } = make()
    await fs.writeFile(join(dir, 'Event-print.png'), 'old')
    const id = await destination(service)
    written(
      await service.write({
        destinationId: id,
        files: [png('Event-print.png')],
        onConflict: 'replace'
      })
    )
    expect(readPngInfo(new Uint8Array(await fs.readFile(join(dir, 'Event-print.png')))).width).toBe(
      4
    )
  })
  it('keeps both by numbering the new file', async () => {
    const { service } = make()
    await fs.writeFile(join(dir, 'Event-print.png'), 'old')
    const id = await destination(service)
    const v = written(
      await service.write({
        destinationId: id,
        files: [png('Event-print.png')],
        onConflict: 'keep-both'
      })
    )
    expect(v.written[0]).toMatchObject({
      requested: 'Event-print.png',
      name: 'Event-print (2).png'
    })
    expect(await fs.readFile(join(dir, 'Event-print.png'), 'utf8')).toBe('old')
  })
  it('reports a per-file failure when the name is taken by a folder, and still writes the rest', async () => {
    const { service } = make()
    await fs.mkdir(join(dir, 'Event-print.png'))
    const id = await destination(service)
    const v = written(
      await service.write({
        destinationId: id,
        files: [png('Event-print.png'), png('Event-design.png')],
        onConflict: 'replace'
      })
    )
    expect(v.written.map((f) => f.name)).toEqual(['Event-design.png'])
    expect(v.failed.map((f) => f.name)).toEqual(['Event-print.png'])
  })
  it('reports a missing destination folder', async () => {
    const { service } = make()
    const id = await destination(service)
    await rm(dir, { recursive: true })
    const r = await service.write({
      destinationId: id,
      files: [png('a-print.png')],
      onConflict: 'ask'
    })
    expect(r).toMatchObject({ status: 'error', error: { code: 'export-destination-missing' } })
    await fs.mkdir(dir)
  })
})

describe('ExportService layer package', () => {
  const entries = () => [
    { path: 'background.png', data: makePng(4, 6), png: { width: 4, height: 6, dpi: 600 } },
    { path: 'text.png', data: makePng(4, 6), png: { width: 4, height: 6, dpi: 600 } },
    { path: 'manifest.json', data: new TextEncoder().encode('{"a":1}\n') },
    { path: 'readme.txt', data: new TextEncoder().encode('hello') }
  ]
  it('builds a ZIP whose PNG entries carry the density, in the given order', async () => {
    const { service } = make()
    const id = await destination(service)
    written(
      await service.write({
        destinationId: id,
        files: [{ kind: 'zip', format: 'layers', name: 'E-layers.zip', entries: entries() }],
        onConflict: 'ask'
      })
    )
    const zip = await zipEntries(join(dir, 'E-layers.zip'))
    expect([...zip.keys()]).toEqual(['background.png', 'text.png', 'manifest.json', 'readme.txt'])
    expect(readPngInfo(new Uint8Array(zip.get('background.png')!)).dpi).toEqual({ x: 600, y: 600 })
    expect(zip.get('manifest.json')!.toString()).toBe('{"a":1}\n')
  })
  it('produces identical bytes for identical input', async () => {
    const { service } = make()
    const id = await destination(service)
    const file = (name: string): ExportFile => ({
      kind: 'zip',
      format: 'layers',
      name,
      entries: entries()
    })
    written(
      await service.write({
        destinationId: id,
        files: [file('a-layers.zip'), file('b-layers.zip')],
        onConflict: 'ask'
      })
    )
    const a = await fs.readFile(join(dir, 'a-layers.zip'))
    const b = await fs.readFile(join(dir, 'b-layers.zip'))
    expect(a.equals(b)).toBe(true)
  })
  it.each([
    ['a path', { path: '../x.png', data: makePng(1, 1), png: { width: 1, height: 1, dpi: 300 } }],
    ['an undeclared PNG', { path: 'x.png', data: makePng(1, 1) }],
    [
      'a wrong-size PNG',
      { path: 'x.png', data: makePng(1, 1), png: { width: 2, height: 1, dpi: 300 } }
    ],
    ['an executable', { path: 'x.exe', data: new Uint8Array([1]) }]
  ])('refuses %s as an entry', async (_label, entry) => {
    const { service } = make()
    const id = await destination(service)
    const r = await service.write({
      destinationId: id,
      files: [
        { kind: 'zip', format: 'layers', name: 'E-layers.zip', entries: [entry] } as ExportFile
      ],
      onConflict: 'ask'
    })
    expect(r.status).toBe('error')
    expect(await fs.readdir(dir)).toEqual([])
  })
})

describe('ExportService.reveal', () => {
  it('reveals only files this destination wrote', async () => {
    const { service, showItemInFolder } = make()
    const id = await destination(service)
    written(
      await service.write({ destinationId: id, files: [png('Event-print.png')], onConflict: 'ask' })
    )
    ok(await service.reveal({ destinationId: id, name: 'Event-print.png' }))
    expect(showItemInFolder).toHaveBeenCalledWith(join(dir, 'Event-print.png'))
    const r = await service.reveal({ destinationId: id, name: '../../etc/passwd' })
    expect(r).toMatchObject({ status: 'error', error: { code: 'not-allowed' } })
    expect(showItemInFolder).toHaveBeenCalledTimes(1)
  })
})

describe('ExportService dslrBooth template (6B)', () => {
  const facts = { width: 4, height: 12, dpi: 300 }
  const xml = (images: string[], photos = 1): Uint8Array =>
    encodeTemplateXml(
      writeTemplateXml({
        root: {
          name: 'Sam & Alex',
          width: 4,
          height: 12,
          dimensions: 0,
          resolution: 300,
          backgroundColor: '#FFFFFFFF',
          print2PerPage: true,
          lastSavedDate: '11/16/2026 10:00:00',
          id: 'A'.repeat(25),
          originalDevice: 'WalkOneTemplateStudio'
        },
        elements: [
          ...images.map((p, i) => ({
            type: 'Image' as const,
            name: p,
            imagePath: p,
            left: 0,
            top: 0,
            width: 4,
            height: 12,
            zIndex: i * 2
          })),
          ...Array.from({ length: photos }, (_, i) => ({
            type: 'Photo' as const,
            name: `Photo ${i + 1}`,
            photoNumber: i + 1,
            left: 1,
            top: 1,
            width: 2,
            height: 2,
            zIndex: i * 2 + 1
          }))
        ]
      })
    )
  const entries = (images = ['background.png', 'artwork-1.png']) => [
    ...images.map((path) => ({ path, data: makePng(4, 12), png: facts })),
    { path: 'preview.png', data: makePng(4, 12), png: facts },
    { path: 'template.xml', data: xml(images) }
  ]

  it('writes the entries in case-insensitive alphabetical order, deflated, with density', async () => {
    const { service } = make()
    const id = await destination(service)
    written(
      await service.write({
        destinationId: id,
        files: [{ kind: 'zip', format: 'dslrbooth', name: 'Sam & Alex.zip', entries: entries() }],
        onConflict: 'ask'
      })
    )
    const zip = await zipEntries(join(dir, 'Sam & Alex.zip'))
    expect([...zip.keys()]).toEqual([
      'artwork-1.png',
      'background.png',
      'preview.png',
      'template.xml'
    ])
    expect(readPngInfo(new Uint8Array(zip.get('preview.png')!)).dpi).toEqual({ x: 300, y: 300 })
    expect([...zip.get('template.xml')!.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })

  it.each([
    [
      'an unreferenced image',
      [...entries(), { path: 'extra.png', data: makePng(4, 12), png: facts }]
    ],
    ['a missing preview', entries().filter((e) => e.path !== 'preview.png')],
    [
      'a wrong-size image',
      entries().map((e) => (e.path === 'background.png' ? { ...e, data: makePng(2, 2) } : e))
    ],
    [
      'a template without photo slots',
      [
        ...entries().filter((e) => e.path !== 'template.xml'),
        { path: 'template.xml', data: xml(['background.png', 'artwork-1.png'], 0) }
      ]
    ]
  ])('refuses %s and writes nothing', async (_label, list) => {
    const { service } = make()
    const id = await destination(service)
    const r = await service.write({
      destinationId: id,
      files: [{ kind: 'zip', format: 'dslrbooth', name: 'T.zip', entries: list } as ExportFile],
      onConflict: 'ask'
    })
    expect(r).toMatchObject({ status: 'error', error: { code: 'export-invalid-output' } })
    expect(await fs.readdir(dir)).toEqual([])
  })
})
