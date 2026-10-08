import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject, type TemplateProject } from '../../domain'
import { PersistenceError } from '../errors'
import { createProjectHandlers } from '../handlers'
import { safeAssetFilename } from '../service'
import { addAssets } from '../../editor/assetMutations'
import { makeEnv, sha, tempDir, useTempDirCleanup, type Env } from './helpers'
import { SAFE_SVG, makeJpeg, makePng, makeWebpExtended, svg } from './imageFixtures'

useTempDirCleanup()

const blank = (): TemplateProject =>
  createProject({
    name: 'Assets',
    design: 'photo-4x6-portrait-300',
    now: '2026-01-01T00:00:00.000Z'
  })

async function openBlank(
  env?: Env
): Promise<{ env: Env; sessionId: string; base: TemplateProject }> {
  const e = env ?? (await makeEnv())
  const base = blank()
  const info = await e.service.createNew(base)
  return { env: e, sessionId: info.sessionId, base }
}

async function writeSource(name: string, data: Uint8Array): Promise<string> {
  const dir = await tempDir('wts-src-')
  const file = join(dir, name)
  await fs.writeFile(file, data)
  return file
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
  } catch (e) {
    return e instanceof PersistenceError ? e.code : String(e)
  }
  return 'no error'
}

/** Applies an import result to a project the way the editor store does. */
const withImported = (
  p: TemplateProject,
  r: Awaited<ReturnType<Env['service']['importAssetFiles']>>
) =>
  addAssets(
    p,
    r.imported.map((i) => i.asset)
  )

describe('importing image files into the working session', () => {
  it('imports PNG, JPG, JPEG, WebP and SVG; metadata comes from the content', async () => {
    const { env, sessionId } = await openBlank()
    const files = [
      await writeSource('rose petals.png', makePng({ width: 30, height: 20, colorType: 6 })),
      await writeSource('photo.jpg', makeJpeg(640, 480)),
      await writeSource('photo2.JPEG', makeJpeg(100, 50)),
      await writeSource('tex.webp', makeWebpExtended(50, 40, true)),
      await writeSource('mark.svg', Buffer.from(SAFE_SVG))
    ]
    const r = await env.service.importAssetFiles(sessionId, files)
    expect(r.failures).toEqual([])
    expect(r.imported.map((i) => i.asset.mediaType)).toEqual([
      'image/png',
      'image/jpeg',
      'image/jpeg',
      'image/webp',
      'image/svg+xml'
    ])
    const [png, jpg, , webp, vec] = r.imported.map((i) => i.asset)
    expect(png).toMatchObject({
      filename: 'rose petals.png',
      pixelWidth: 30,
      pixelHeight: 20,
      hasAlpha: true
    })
    expect(png?.path).toMatch(/^assets\/[^/]+\.png$/)
    expect(png?.path).not.toContain('rose')
    expect(jpg).toMatchObject({ pixelWidth: 640, pixelHeight: 480, hasAlpha: false })
    expect(webp).toMatchObject({ pixelWidth: 50, pixelHeight: 40, hasAlpha: true })
    expect(vec).toMatchObject({ pixelWidth: 200, pixelHeight: 100 })
    expect(vec?.hasAlpha).toBeUndefined()
    // byteSize + sha256 describe the stored file; the source is only a label (no absolute path anywhere)
    const stored = await fs.readFile(
      join(env.sessionsRoot, sessionId, ...(png?.path ?? '').split('/'))
    )
    expect(stored.length).toBe(png?.byteSize)
    expect(sha(stored)).toBe(png?.sha256)
    expect(JSON.stringify(r)).not.toContain(env.root)
  })

  it('the project owns the asset: deleting the source file does not break it', async () => {
    const { env, sessionId } = await openBlank()
    const source = await writeSource('gone.png', makePng({ width: 8, height: 8 }))
    const r = await env.service.importAssetFiles(sessionId, [source])
    const asset = r.imported[0]?.asset
    await fs.rm(source)
    const bytes = await env.service.readAsset(sessionId, asset?.id ?? '')
    expect(bytes.mediaType).toBe('image/png')
    expect(bytes.data.length).toBe(asset?.byteSize)
  })

  it('rejects unsupported formats and unsafe SVG per file, importing the rest', async () => {
    const { env, sessionId } = await openBlank()
    const good = await writeSource('ok.png', makePng({ width: 4, height: 4 }))
    const pdf = await writeSource('doc.pdf', Buffer.from('%PDF-1.4 ...'))
    const bad = await writeSource('evil.svg', svg('<script>alert(1)</script>'))
    const missing = join(env.root, 'does-not-exist.png')
    const r = await env.service.importAssetFiles(sessionId, [pdf, bad, good, missing])
    expect(r.imported).toHaveLength(1)
    expect(r.failures.map((f) => [f.filename, f.error.code])).toEqual([
      ['doc.pdf', 'unsupported-format'],
      ['evil.svg', 'unsafe-svg'],
      ['does-not-exist.png', 'file-not-found']
    ])
    // nothing was copied for the failures
    const files = await fs.readdir(join(env.sessionsRoot, sessionId, 'assets'))
    expect(files).toHaveLength(1)
    // messages carry no paths
    for (const f of r.failures) expect(f.error.message).not.toContain(env.root)
  })

  it('a pure-extension lie is judged by content', async () => {
    const { env, sessionId } = await openBlank()
    const liar = await writeSource('actually-jpeg.png', makeJpeg(10, 10))
    const r = await env.service.importAssetFiles(sessionId, [liar])
    expect(r.imported[0]?.asset.mediaType).toBe('image/jpeg')
    expect(r.imported[0]?.asset.path.endsWith('.jpg')).toBe(true)
  })

  it('leaves no temp files behind', async () => {
    const { env, sessionId } = await openBlank()
    await env.service.importAssetFiles(sessionId, [
      await writeSource('a.png', makePng({ width: 3, height: 3 }))
    ])
    const files = await fs.readdir(join(env.sessionsRoot, sessionId, 'assets'))
    expect(files.every((f) => !f.includes('.tmp-'))).toBe(true)
  })

  it('imports dropped files from bytes with a sanitized display name', async () => {
    const { env, sessionId } = await openBlank()
    const r = await env.service.importAssetBytes(sessionId, [
      { name: '../../etc/pass\u0000wd.png', data: makePng({ width: 5, height: 5 }) }
    ])
    expect(r.failures).toEqual([])
    const asset = r.imported[0]?.asset
    expect(asset?.filename).toBe('passwd.png')
    expect(asset?.path).toMatch(/^assets\/[^/]+\.png$/)
  })

  it('an unknown session is refused', async () => {
    const env = await makeEnv()
    expect(await code(env.service.importAssetBytes('nope', []))).toBe('session-not-found')
  })
})

describe('de-duplication by content hash', () => {
  it('importing the same content again reuses the asset; names do not matter', async () => {
    const { env, sessionId } = await openBlank()
    const png = makePng({ width: 6, height: 6 })
    const a = await env.service.importAssetFiles(sessionId, [await writeSource('first.png', png)])
    const b = await env.service.importAssetFiles(sessionId, [
      await writeSource('renamed copy.png', png)
    ])
    expect(a.imported[0]?.deduplicated).toBe(false)
    expect(b.imported[0]?.deduplicated).toBe(true)
    expect(b.imported[0]?.asset.id).toBe(a.imported[0]?.asset.id)
    expect(b.imported[0]?.asset.filename).toBe('first.png')
    expect(await fs.readdir(join(env.sessionsRoot, sessionId, 'assets'))).toHaveLength(1)
  })

  it('different content with the same file name stays separate and safe', async () => {
    const { env, sessionId } = await openBlank()
    const a = await env.service.importAssetFiles(sessionId, [
      await writeSource('logo.png', makePng({ width: 6, height: 6, rgba: [1, 2, 3, 255] }))
    ])
    const b = await env.service.importAssetFiles(sessionId, [
      await writeSource('logo.png', makePng({ width: 6, height: 6, rgba: [9, 9, 9, 255] }))
    ])
    expect(b.imported[0]?.deduplicated).toBe(false)
    expect(b.imported[0]?.asset.id).not.toBe(a.imported[0]?.asset.id)
    expect(b.imported[0]?.asset.path).not.toBe(a.imported[0]?.asset.path)
    expect(await fs.readdir(join(env.sessionsRoot, sessionId, 'assets'))).toHaveLength(2)
  })

  it('an asset whose import was undone (not in the project) is reused again on redo/re-import', async () => {
    const { env, sessionId, base } = await openBlank()
    const png = makePng({ width: 6, height: 6 })
    const a = await env.service.importAssetBytes(sessionId, [{ name: 'a.png', data: png }])
    // The project never received (or already dropped) the record; the file is still in the session.
    await env.service.updateWorkingCopy(sessionId, base)
    const b = await env.service.importAssetBytes(sessionId, [{ name: 'a.png', data: png }])
    expect(b.imported[0]?.deduplicated).toBe(true)
    expect(b.imported[0]?.asset.id).toBe(a.imported[0]?.asset.id)
  })

  it('a missing stored file is re-imported rather than trusted', async () => {
    const { env, sessionId } = await openBlank()
    const png = makePng({ width: 6, height: 6 })
    const a = await env.service.importAssetBytes(sessionId, [{ name: 'a.png', data: png }])
    await fs.rm(join(env.sessionsRoot, sessionId, ...(a.imported[0]?.asset.path ?? '').split('/')))
    const b = await env.service.importAssetBytes(sessionId, [{ name: 'a.png', data: png }])
    expect(b.imported[0]?.deduplicated).toBe(false)
    const bytes = await env.service.readAsset(sessionId, b.imported[0]?.asset.id ?? '')
    expect(bytes.data.length).toBe(png.length)
  })
})

describe('portability: save, Save As, reopen, recovery', () => {
  async function importedProject() {
    const { env, sessionId, base } = await openBlank()
    const png = makePng({ width: 12, height: 9, colorType: 6 })
    const svgFile = Buffer.from(SAFE_SVG)
    const r = await env.service.importAssetBytes(sessionId, [
      { name: 'petals.png', data: png },
      { name: 'mark.svg', data: svgFile }
    ])
    let project = withImported(base, r)
    // Two layers sharing one asset + one using the other.
    const [petals, mark] = r.imported.map((i) => i.asset)
    const layer = (id: string, assetId: string, z: number) =>
      ({
        id,
        type: 'image',
        name: id,
        x: 0,
        y: 0,
        width: 50,
        height: 40,
        rotation: 0,
        opacity: 1,
        zIndex: z,
        visible: true,
        locked: false,
        assetId,
        role: 'overlay',
        fit: 'contain'
      }) as const
    project = {
      ...project,
      layers: [
        layer('l1', petals?.id ?? '', 0),
        layer('l2', petals?.id ?? '', 1),
        layer('l3', mark?.id ?? '', 2)
      ]
    }
    return { env, sessionId, project, png, svgFile }
  }

  it('Save writes imported assets into the .boothproject and a different machine reopens them', async () => {
    const { env, sessionId, project, png, svgFile } = await importedProject()
    const dest = join(await tempDir(), 'Imported.boothproject')
    await env.service.saveAs(sessionId, project, dest)

    const other = await makeEnv() // a different machine: its own sessions, nothing shared
    const opened = await other.service.openFile(dest)
    expect(opened.project.assets).toHaveLength(2)
    expect(
      opened.project.layers.filter((l) => l.type === 'image' && l.assetId === project.assets[0]?.id)
    ).toHaveLength(2)
    const a = await other.service.readAsset(opened.sessionId, project.assets[0]?.id ?? '')
    const b = await other.service.readAsset(opened.sessionId, project.assets[1]?.id ?? '')
    expect(Buffer.from(a.data).equals(png)).toBe(true)
    expect(Buffer.from(b.data).equals(svgFile)).toBe(true)
  })

  it('Save As to a second destination also carries every asset', async () => {
    const { env, sessionId, project } = await importedProject()
    const dir = await tempDir()
    await env.service.saveAs(sessionId, project, join(dir, 'one.boothproject'))
    await env.service.saveAs(sessionId, project, join(dir, 'two.boothproject'))
    const other = await makeEnv()
    const opened = await other.service.openFile(join(dir, 'two.boothproject'))
    for (const a of opened.project.assets) {
      const got = await other.service.readAsset(opened.sessionId, a.id)
      expect(got.data.length).toBe(a.byteSize)
    }
  })

  it('an asset removed from the project is not packaged (only referenced assets are)', async () => {
    const { env, sessionId, project } = await importedProject()
    const slim: TemplateProject = {
      ...project,
      assets: project.assets.slice(0, 1),
      layers: project.layers.filter(
        (l) => l.type === 'image' && l.assetId === project.assets[0]?.id
      )
    }
    const dest = join(await tempDir(), 'slim.boothproject')
    await env.service.saveAs(sessionId, slim, dest)
    const opened = await (await makeEnv()).service.openFile(dest)
    expect(opened.project.assets).toHaveLength(1)
    expect(opened.warnings).toEqual([])
  })

  it('crash recovery restores the imported asset and its layer', async () => {
    const { env, sessionId, project, png } = await importedProject()
    await env.service.updateWorkingCopy(sessionId, project) // autosave
    const next = await makeEnv(env.root) // new app run; the old one never closed
    const scan = await next.service.scanRecovery()
    expect(scan.candidates).toHaveLength(1)
    expect(scan.candidates[0]?.missingAssets).toBe(0)
    const rec = await next.service.recover(sessionId)
    expect(rec.project.assets).toHaveLength(2)
    const bytes = await next.service.readAsset(rec.sessionId, project.assets[0]?.id ?? '')
    expect(Buffer.from(bytes.data).equals(png)).toBe(true)
  })

  it('recovery drops files of imports that were undone before the crash (no orphans)', async () => {
    const { env, sessionId, project } = await importedProject()
    // The user imported a third image, then undid it: the project no longer lists it, but its file is in the session.
    const stray = await env.service.importAssetBytes(sessionId, [
      { name: 'undone.png', data: makePng({ width: 2, height: 2, rgba: [5, 6, 7, 255] }) }
    ])
    await env.service.updateWorkingCopy(sessionId, project)
    const strayPath = join(
      env.sessionsRoot,
      sessionId,
      ...(stray.imported[0]?.asset.path ?? '').split('/')
    )
    expect((await fs.stat(strayPath)).isFile()).toBe(true)
    const next = await makeEnv(env.root)
    await next.service.scanRecovery()
    await next.service.recover(sessionId)
    expect(await fs.stat(strayPath).catch(() => null)).toBeNull()
    expect(await fs.readdir(join(env.sessionsRoot, sessionId, 'assets'))).toHaveLength(2)
  })

  it('closing a session removes its imported files', async () => {
    const { env, sessionId } = await openBlank()
    await env.service.importAssetBytes(sessionId, [
      { name: 'a.png', data: makePng({ width: 2, height: 2 }) }
    ])
    await env.service.close(sessionId)
    expect(await fs.readdir(env.sessionsRoot)).toEqual([])
  })
})

describe('asset import through the IPC handlers', () => {
  async function setup(pick: string[] | null) {
    const env = await makeEnv()
    const handlers = createProjectHandlers({
      service: env.service,
      recents: env.recents,
      dialogs: {
        showOpen: async () => null,
        showSave: async () => null,
        showImportImages: async () => pick
      }
    })
    const info = await env.service.createNew(blank())
    return { env, handlers, sessionId: info.sessionId }
  }

  it('cancelling the picker is a cancelled result, not an error', async () => {
    const { handlers, sessionId } = await setup(null)
    expect(await handlers.importAssets(null, { sessionId })).toEqual({ status: 'cancelled' })
  })

  it('imports the chosen files and returns structured per-file failures', async () => {
    const good = await writeSource('g.png', makePng({ width: 4, height: 4 }))
    const bad = await writeSource('b.txt', Buffer.from('hello'))
    const { handlers, sessionId } = await setup([good, bad])
    const r = await handlers.importAssets(null, { sessionId })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.value.imported).toHaveLength(1)
    expect(r.value.failures[0]).toMatchObject({
      filename: 'b.txt',
      error: { code: 'unsupported-format' }
    })
  })

  it('validates request shapes (no extra keys, bad ids, empty or non-binary data)', async () => {
    const { handlers, sessionId } = await setup(null)
    const bad = async (payload: unknown) => {
      const r = await handlers.importAssetData(payload)
      return r.status === 'error' ? r.error.code : r.status
    }
    expect(await bad({ sessionId, files: [] })).toBe('invalid-request')
    expect(await bad({ sessionId, files: [{ name: 'a.png', data: 'not bytes' }] })).toBe(
      'invalid-request'
    )
    expect(
      await bad({
        sessionId,
        files: [{ name: 'a.png', data: new Uint8Array(1), path: '/etc/passwd' }]
      })
    ).toBe('invalid-request')
    expect(await bad({ sessionId: '', files: [] })).toBe('invalid-request')
    expect(
      await bad({ sessionId, files: [{ name: 'a.png', data: new Uint8Array(1) }], extra: 1 })
    ).toBe('invalid-request')
  })

  it('there is no handler that takes a renderer-supplied path', () => {
    const names = Object.keys(
      createProjectHandlers({
        service: {} as never,
        recents: {} as never,
        dialogs: {
          showOpen: async () => null,
          showSave: async () => null,
          showImportImages: async () => null
        }
      })
    )
    expect(names.filter((n) => /import/i.test(n)).sort()).toEqual([
      'importAssetData',
      'importAssets'
    ])
  })
})

describe('safeAssetFilename', () => {
  it('keeps the last segment, strips control characters, bounds the length', () => {
    expect(safeAssetFilename('C:\\Users\\me\\Pic.PNG', 'png')).toBe('Pic.PNG')
    expect(safeAssetFilename('/a/b/c.jpg', 'jpg')).toBe('c.jpg')
    expect(safeAssetFilename('', 'png')).toBe('image.png')
    expect(safeAssetFilename('..', 'png')).toBe('image.png')
    const long = safeAssetFilename(`${'x'.repeat(400)}.png`, 'png')
    expect(long.length).toBe(255)
    expect(long.endsWith('.png')).toBe(true)
  })
})
