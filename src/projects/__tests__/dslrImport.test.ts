import { createWriteStream, existsSync, readdirSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { loadProject, type PhotoLayer } from '../../domain'
import { mainVariant, planDslrTemplate } from '../../export/dslrbooth/plan'
import { parseTemplateXml } from '../../export/dslrbooth/templateXml'
import { createProjectHandlers } from '../handlers'
import { analyzeDslrPackage, DSLR_IMPORT_LIMITS } from '../dslrImport'
import { makeEnv, tempDir, useTempDirCleanup } from './helpers'
import { makePng } from './imageFixtures'

useTempDirCleanup()

const XML = (images: string[] = ['bg.png']): string =>
  '﻿<?xml version="1.0" encoding="UTF-8"?>\r\n' +
  '<Template Name="Zip Test" Width="1200" Height="1800" Dimensions="0" Resolution="300" BackgroundColor="#FFFFFFFF" print_2_per_page="False" PrintToSecondaryPrinter="False" LastSavedDate="01/02/2026 03:04:05" Id="abcdefghijklmnopqrstuvwxy" IsLegacy="True" OriginalDevice="PC">\r\n' +
  '  <Elements>\r\n' +
  images
    .map(
      (f, i) =>
        `    <Image Name="${f}" Opacity="100" Width="1200" Height="1800" Top="0" Left="0" ImagePath="${f}" KeepAspect="True" Thickness="0" StrokeColor="#FF000000" ZIndex="${images.length - i}" />\r\n`
    )
    .join('') +
  '    <Photo Name="Photo 1" Opacity="100" Width="900" Height="600" Top="100" Left="150" ImagePath="" KeepAspect="True" Thickness="0" StrokeColor="#FF000000" PhotoNumber="1" ZIndex="0" />\r\n' +
  '  </Elements>\r\n</Template>'

const png = makePng({ width: 12, height: 18 })

async function zip(entries: [string, Buffer | string][], name = 'Zip Test.zip'): Promise<string> {
  const dir = await tempDir('wts-dslr-')
  const file = join(dir, name)
  const z = new yazl.ZipFile()
  for (const [n, d] of entries) z.addBuffer(Buffer.isBuffer(d) ? d : Buffer.from(d, 'utf8'), n)
  z.end()
  await new Promise<void>((res, rej) => {
    z.outputStream
      .pipe(createWriteStream(file))
      .on('close', () => res())
      .on('error', rej)
  })
  return file
}

describe('analyzeDslrPackage (ZIP reading)', () => {
  it('reads a flat template ZIP and returns the project, assets and preview', async () => {
    const file = await zip([
      ['template.xml', XML()],
      ['bg.png', png],
      ['preview.png', makePng({ width: 4, height: 6 })]
    ])
    const a = await analyzeDslrPackage(file)
    expect(a.result.summary).toMatchObject({
      fileName: 'Zip Test.zip',
      templateName: 'Zip Test',
      photoCount: 1,
      images: 1
    })
    expect(a.preview).toMatchObject({ width: 4, height: 6 })
    expect(a.initialAssets).toHaveLength(1)
    expect(Buffer.from(a.initialAssets[0]!.data).equals(png)).toBe(true)
    expect(a.result.project.assets[0]).toMatchObject({
      pixelWidth: 12,
      pixelHeight: 18,
      mediaType: 'image/png'
    })
  })

  it('finds template.xml inside one folder and ignores macOS zip junk', async () => {
    const file = await zip([
      ['My Template/template.xml', XML()],
      ['My Template/bg.png', png],
      ['__MACOSX/My Template/._bg.png', 'junk'],
      ['My Template/.DS_Store', 'junk']
    ])
    const a = await analyzeDslrPackage(file)
    expect(a.result.project.layers.map((l) => l.type)).toEqual(['photo', 'image'])
    expect(a.result.items.map((i) => i.code)).not.toContain('unused-files')
  })

  it('a picture that is not an image is left out with a warning', async () => {
    const file = await zip([
      ['template.xml', XML(['bg.png'])],
      ['bg.png', 'not a png']
    ])
    const a = await analyzeDslrPackage(file)
    expect(a.result.items.map((i) => i.code)).toContain('unreadable-image')
    expect(a.initialAssets).toHaveLength(0)
  })

  it.each([
    ['no template.xml', [['bg.png', png]] as [string, Buffer | string][], /no template\.xml/],
    [
      'two templates',
      [
        ['a/template.xml', XML()],
        ['b/template.xml', XML()]
      ] as [string, Buffer | string][],
      /more than one template/
    ],
    [
      'broken XML',
      [['template.xml', '<Template>']] as [string, Buffer | string][],
      /could not be read/
    ]
  ])('refuses a ZIP with %s', async (_l, entries, msg) => {
    await expect(analyzeDslrPackage(await zip(entries))).rejects.toMatchObject({
      code: 'import-invalid',
      message: expect.stringMatching(msg)
    })
  })

  it('refuses files that are not ZIPs, missing files, oversized XML and too many entries', async () => {
    const dir = await tempDir()
    const notZip = join(dir, 'x.zip')
    await writeFile(notZip, 'hello')
    await expect(analyzeDslrPackage(notZip)).rejects.toMatchObject({ code: 'import-invalid' })
    await expect(analyzeDslrPackage(join(dir, 'nope.zip'))).rejects.toMatchObject({
      code: 'file-not-found'
    })
    const big = await zip([['template.xml', ' '.repeat(DSLR_IMPORT_LIMITS.maxXmlBytes + 1)]])
    await expect(analyzeDslrPackage(big)).rejects.toMatchObject({
      message: expect.stringMatching(/too large/)
    })
    const many = await zip(
      Array.from(
        { length: DSLR_IMPORT_LIMITS.maxEntries + 1 },
        (_, i) => [`f${i}.txt`, 'x'] as [string, string]
      )
    )
    await expect(analyzeDslrPackage(many)).rejects.toMatchObject({
      message: expect.stringMatching(/too many files/)
    })
  })

  it('refuses a ZIP with a path that escapes the folder', async () => {
    // yazl refuses to write "../", so patch the name in the archive bytes (same length).
    const file = await zip([
      ['template.xml', XML()],
      ['xx/evil.png', png]
    ])
    const bytes = await readFile(file)
    let s = bytes.toString('latin1')
    s = s.split('xx/evil.png').join('../evil.png')
    await writeFile(file, Buffer.from(s, 'latin1'))
    await expect(analyzeDslrPackage(file)).rejects.toMatchObject({ code: 'unsafe-path' })
  })
})

describe('handlers: choose → commit', () => {
  async function setup(path: string | null) {
    const env = await makeEnv()
    const handlers = createProjectHandlers({
      service: env.service,
      recents: env.recents,
      dialogs: {
        showOpen: async () => null,
        showSave: async () => null,
        showImportImages: async () => null,
        showImportDslr: async () => path
      }
    })
    return { env, handlers }
  }

  it('cancelling the picker is not an error', async () => {
    const { handlers } = await setup(null)
    expect(await handlers.dslrImportChoose(undefined)).toEqual({ status: 'cancelled' })
  })

  it('analyses, then creates an unsaved project with the pictures in its session', async () => {
    const file = await zip([
      ['template.xml', XML()],
      ['bg.png', png]
    ])
    const { env, handlers } = await setup(file)
    const chosen = await handlers.dslrImportChoose(undefined)
    if (chosen.status !== 'ok') throw new Error(JSON.stringify(chosen))
    expect(chosen.value).toMatchObject({
      fileName: 'Zip Test.zip',
      recommendedLayout: 'as-is',
      twoUp: null,
      preview: null
    })
    expect(chosen.value.token).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(chosen.value)).not.toContain(file) // no path crosses IPC
    const r = await handlers.dslrImportCommit({ token: chosen.value.token, layout: 'as-is' })
    if (r.status !== 'ok') throw new Error(JSON.stringify(r))
    expect(r.value).toMatchObject({ fileName: null, dirty: true })
    expect(r.value.warnings[0]).toMatch(/Imported “Zip Test.zip” from dslrBooth/)
    expect(loadProject(r.value.project).ok).toBe(true)
    const assetFiles = await readdir(join(env.sessionsRoot, r.value.sessionId, 'assets'))
    expect(assetFiles).toEqual([r.value.project.assets[0]!.path.slice('assets/'.length)])
    // A token works once; unknown tokens and bad layouts are refused.
    expect(
      await handlers.dslrImportCommit({ token: chosen.value.token, layout: 'as-is' })
    ).toMatchObject({ status: 'error', error: { code: 'not-allowed' } })
    expect(await handlers.dslrImportCommit({ token: 'zz', layout: 'as-is' })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
  })

  it('the imported project saves and reopens like any project', async () => {
    const file = await zip([
      ['template.xml', XML()],
      ['bg.png', png]
    ])
    const { env, handlers } = await setup(file)
    const chosen = await handlers.dslrImportChoose(undefined)
    if (chosen.status !== 'ok') throw new Error('choose failed')
    const r = await handlers.dslrImportCommit({ token: chosen.value.token, layout: 'as-is' })
    if (r.status !== 'ok') throw new Error('commit failed')
    const target = join(env.root, 'Imported.boothproject')
    const saved = await env.service.saveAs(r.value.sessionId, r.value.project, target)
    expect(saved.dirty).toBe(false)
    const reopened = await env.service.openFile(target)
    expect(reopened.project.sourceCompatibility?.dslrbooth?.adapterVersion).toBe('7.48-import-2')
    expect(reopened.project.layers).toHaveLength(2)
  })
})

// ---- the five real exports (private, local only; skipped when absent) --------------------------------------------------

const FIXTURES = join(__dirname, '../../../tests/fixtures/dslrbooth/source')
const fixtureZips = existsSync(FIXTURES)
  ? readdirSync(FIXTURES)
      .filter((n) => n.endsWith('.zip'))
      .sort()
  : []

describe.skipIf(fixtureZips.length === 0)('real dslrBooth exports (fixtures)', () => {
  it('there are five', () => expect(fixtureZips).toHaveLength(5))

  it.each(fixtureZips)('%s imports as a valid project with no warnings', async (name) => {
    const a = await analyzeDslrPackage(join(FIXTURES, name))
    expect(loadProject(JSON.parse(JSON.stringify(a.result.project))).ok).toBe(true)
    expect(a.result.items.filter((i) => i.severity !== 'info')).toEqual([])
    expect(a.preview).not.toBeNull()
    expect(a.initialAssets.length).toBe(a.result.project.assets.length)
  })

  it.each(fixtureZips)(
    '%s: imported as-is, every photo slot exports back to its original box',
    async (name) => {
      const a = await analyzeDslrPackage(join(FIXTURES, name), 'as-is')
      const { default: yauzl } = await import('yauzl')
      const xml = await new Promise<Buffer>((res, rej) =>
        yauzl.open(join(FIXTURES, name), { lazyEntries: true }, (e, z) => {
          if (e) return rej(e)
          z.on('entry', (en: import('yauzl').Entry) => {
            if (en.fileName !== 'template.xml') return z.readEntry()
            z.openReadStream(en, (e2, s) => {
              if (e2) return rej(e2)
              const c: Buffer[] = []
              s.on('data', (d: Buffer) => c.push(d)).on(
                'end',
                () => (z.close(), res(Buffer.concat(c)))
              )
            })
          })
          z.readEntry()
        })
      )
      const original = parseTemplateXml(new Uint8Array(xml))
        .elements.filter((e) => e.type === 'Photo')
        .map((e) => [
          +e.attributes.PhotoNumber!,
          +e.attributes.Left!,
          +e.attributes.Top!,
          +e.attributes.Width!,
          +e.attributes.Height!
        ])
        .sort()
      const plan = planDslrTemplate(a.result.project, mainVariant(a.result.project))
      const exported = plan.items
        .flatMap((i) =>
          i.kind === 'photo'
            ? i.photo.boxes.map((b) => [i.photo.photoNumber, b.left, b.top, b.width, b.height])
            : []
        )
        .sort()
      expect(exported).toEqual(original)
    }
  )

  it('the three two-strip sheets import as one 2×6 strip, the two single designs as they are', async () => {
    const layouts = await Promise.all(
      fixtureZips.map(async (n) => {
        const r = (await analyzeDslrPackage(join(FIXTURES, n))).result
        const photos = r.project.layers.filter((l): l is PhotoLayer => l.type === 'photo')
        return [
          r.layout,
          r.project.canvas.print.width,
          r.project.canvas.print.height,
          photos.map((p) => p.photoNumber).join('')
        ]
      })
    )
    expect(layouts).toEqual([
      ['strip', 2, 6, '123'],
      ['as-is', 6, 4, '1'],
      ['strip', 2, 6, '123'],
      ['strip', 2, 6, '123'],
      ['as-is', 6, 4, '1']
    ])
  })
})
