import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProjectHandlers, type ProjectDialogs } from '../handlers'
import { toSafeError, PersistenceError } from '../errors'
import { makeEnv, sampleProject, tempDir, useTempDirCleanup, ASSETS } from './helpers'

useTempDirCleanup()

function dialogs(
  open: string | null,
  save: string | null,
  images: string[] | null = null
): ProjectDialogs & { saveNames: string[] } {
  const saveNames: string[] = []
  return {
    saveNames,
    showOpen: async () => open,
    showImportImages: async () => images,
    showSave: async (_c, name) => {
      saveNames.push(name)
      return save
    }
  }
}

async function setup(open: string | null = null, save: string | null = null) {
  const env = await makeEnv()
  const d = dialogs(open, save)
  const logs: unknown[] = []
  const handlers = createProjectHandlers({
    service: env.service,
    recents: env.recents,
    dialogs: d,
    log: (m, x) => logs.push([m, x])
  })
  return { env, d, handlers, logs }
}

describe('project IPC handlers', () => {
  it('treats a cancelled Open dialog as cancellation, not an error', async () => {
    const { handlers } = await setup(null)
    expect(await handlers.open(null)).toEqual({ status: 'cancelled' })
  })

  it('treats a cancelled Save As dialog as cancellation and does not touch the project', async () => {
    const { handlers, env } = await setup(null, null)
    const created = await handlers.newProject({ name: 'N', preset: 'strip-2x6-600' })
    if (created.status !== 'ok') throw new Error('expected ok')
    const res = await handlers.saveAs(null, {
      sessionId: created.value.sessionId,
      project: created.value.project
    })
    expect(res).toEqual({ status: 'cancelled' })
    expect(env.service.hasSavedFile(created.value.sessionId)).toBe(false)
  })

  it('new → save (dialog appends extension) → close → recents → open recent', async () => {
    const dir = await tempDir()
    const { handlers, d } = await setup(null, join(dir, 'My Event'))
    const created = await handlers.newProject({
      name: 'My Event!',
      preset: 'photo-4x6-portrait-600'
    })
    if (created.status !== 'ok') throw new Error('expected ok')
    expect(created.value).toMatchObject({ fileName: null, dirty: true })
    const saved = await handlers.save(null, {
      sessionId: created.value.sessionId,
      project: created.value.project
    })
    expect(saved).toMatchObject({
      status: 'ok',
      value: { fileName: 'My Event.boothproject', dirty: false }
    })
    expect(d.saveNames).toEqual(['My Event!.boothproject'])
    expect(await handlers.close({ sessionId: created.value.sessionId })).toEqual({
      status: 'ok',
      value: null
    })

    const recents = await handlers.recents()
    if (recents.status !== 'ok') throw new Error('expected ok')
    expect(recents.value).toHaveLength(1)
    expect(Object.keys(recents.value[0]!).sort()).toEqual([
      'exists',
      'lastOpenedAt',
      'name',
      'path',
      'print'
    ])
    // Only the print size (inches + DPI) for the Start screen card: never the project contents.
    expect(Object.keys(recents.value[0]!.print!).sort()).toEqual(['dpi', 'height', 'width'])
    const reopened = await handlers.openRecent({ path: recents.value[0]!.path })
    expect(reopened).toMatchObject({
      status: 'ok',
      value: { fileName: 'My Event.boothproject', dirty: false }
    })
  })

  it('Save on an already-saved project does not show a dialog', async () => {
    const dir = await tempDir()
    const { handlers, d } = await setup(null, join(dir, 'a.boothproject'))
    const created = await handlers.newProject({ name: 'A', preset: 'strip-2x6-300' })
    if (created.status !== 'ok') throw new Error('expected ok')
    const args = { sessionId: created.value.sessionId, project: created.value.project }
    await handlers.saveAs(null, args)
    await handlers.save(null, args)
    expect(d.saveNames).toHaveLength(1)
  })

  it('rejects openRecent for paths that are not in the recent list', async () => {
    const { handlers } = await setup()
    const res = await handlers.openRecent({ path: '/etc/passwd' })
    expect(res).toMatchObject({ status: 'error', error: { code: 'not-allowed' } })
  })

  it('removes a missing recent entry when it fails to open', async () => {
    const dir = await tempDir()
    const { handlers, env } = await setup()
    const gone = join(dir, 'gone.boothproject')
    await env.recents.add({ path: gone, name: 'Gone' })
    expect(await handlers.openRecent({ path: gone })).toMatchObject({
      status: 'error',
      error: { code: 'file-not-found' }
    })
    expect(await env.recents.list()).toEqual([])
  })

  it('validates request payloads', async () => {
    const { handlers } = await setup()
    expect(await handlers.newProject({ name: '', preset: 'nope' })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
    expect(await handlers.close({ sessionId: 42 })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
    expect(await handlers.save(null, { sessionId: 'x', project: {}, extra: 1 })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
  })

  it('rejects an invalid project payload with a structured error and no internal detail', async () => {
    const { handlers, logs } = await setup()
    const created = await handlers.newProject({ name: 'A', preset: 'strip-2x6-300' })
    if (created.status !== 'ok') throw new Error('expected ok')
    const res = await handlers.updateWorkingCopy({
      sessionId: created.value.sessionId,
      project: { schemaVersion: 1 }
    })
    expect(res.status).toBe('error')
    expect(JSON.stringify(res)).not.toMatch(/\/|zod|stack/i)
    expect(logs.length).toBeGreaterThan(0)
  })

  it('creates the diagnostic sample project with a real asset that survives save and reopen', async () => {
    const dir = await tempDir()
    const { handlers } = await setup(join(dir, 's.boothproject'), join(dir, 's.boothproject'))
    const sample = await handlers.newSampleProject()
    if (sample.status !== 'ok') throw new Error('expected ok')
    expect(sample.value.project.assets).toHaveLength(1)
    await handlers.save(null, { sessionId: sample.value.sessionId, project: sample.value.project })
    const opened = await handlers.open(null)
    expect(opened).toMatchObject({ status: 'ok', value: { dirty: false } })
    if (opened.status === 'ok')
      expect(opened.value.project.assets[0]?.path).toBe('assets/sample.png')
  })

  it('never exposes internal session paths in returned data', async () => {
    const { handlers, env } = await setup()
    const created = await handlers.newProject({ name: 'A', preset: 'strip-2x6-300' })
    expect(JSON.stringify(created)).not.toContain(env.sessionsRoot)
  })

  it('unused: sampleProject helper stays compatible', () => {
    expect(sampleProject(ASSETS).assets).toHaveLength(2)
  })
})

describe('error mapping', () => {
  it('maps unknown errors to a generic safe error and keeps PersistenceError codes', () => {
    expect(toSafeError(new Error('ENOENT /Users/someone/secret'))).toEqual({
      code: 'unexpected',
      message: 'An unexpected error occurred.'
    })
    expect(
      toSafeError(new PersistenceError('missing-asset', 'Missing logo', 'internal /path'))
    ).toEqual({ code: 'missing-asset', message: 'Missing logo' })
  })
})

describe('readAsset bridge', () => {
  it('serves project asset bytes by session and asset id, never by path', async () => {
    const { handlers } = await setup()
    const sample = await handlers.newSampleProject()
    if (sample.status !== 'ok') throw new Error('expected ok')
    const asset = sample.value.project.assets[0]!
    const res = await handlers.readAsset({ sessionId: sample.value.sessionId, assetId: asset.id })
    if (res.status !== 'ok') throw new Error(JSON.stringify(res))
    expect(res.value.mediaType).toBe('image/png')
    expect(res.value.data.length).toBe(asset.byteSize)
    expect(Array.from(res.value.data.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]) // PNG signature
  })

  it('rejects unknown assets, unknown sessions and malformed requests with safe errors', async () => {
    const { handlers, env } = await setup()
    const sample = await handlers.newSampleProject()
    if (sample.status !== 'ok') throw new Error('expected ok')
    expect(
      await handlers.readAsset({ sessionId: sample.value.sessionId, assetId: 'nope' })
    ).toMatchObject({ status: 'error', error: { code: 'missing-asset' } })
    expect(await handlers.readAsset({ sessionId: 'nope', assetId: 'x' })).toMatchObject({
      status: 'error',
      error: { code: 'session-not-found' }
    })
    expect(
      await handlers.readAsset({ sessionId: 'x', assetId: 'y', path: '/etc/passwd' })
    ).toMatchObject({ status: 'error', error: { code: 'invalid-request' } })
    expect(
      JSON.stringify(
        await handlers.readAsset({ sessionId: sample.value.sessionId, assetId: 'nope' })
      )
    ).not.toContain(env.sessionsRoot)
  })

  it('a missing file on disk is a missing-asset error', async () => {
    const { handlers, env } = await setup()
    const sample = await handlers.newSampleProject()
    if (sample.status !== 'ok') throw new Error('expected ok')
    const { rm } = await import('node:fs/promises')
    await rm(join(env.sessionsRoot, sample.value.sessionId, 'assets/sample.png'))
    const asset = sample.value.project.assets[0]!
    expect(
      await handlers.readAsset({ sessionId: sample.value.sessionId, assetId: asset.id })
    ).toMatchObject({ status: 'error', error: { code: 'missing-asset' } })
  })

  it('assets added through updateWorkingCopy become readable', async () => {
    const { handlers, env } = await setup()
    const created = await handlers.newProject({ name: 'N', preset: 'strip-2x6-300' })
    if (created.status !== 'ok') throw new Error('expected ok')
    const { writeFile, mkdir } = await import('node:fs/promises')
    const dir = join(env.sessionsRoot, created.value.sessionId, 'assets')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'late.png'), Buffer.from('abc'))
    const project = {
      ...created.value.project,
      assets: [
        {
          id: 'late',
          filename: 'late.png',
          mediaType: 'image/png' as const,
          path: 'assets/late.png',
          source: { kind: 'upload' as const }
        }
      ]
    }
    await env.service.updateWorkingCopy(created.value.sessionId, project)
    const res = await handlers.readAsset({ sessionId: created.value.sessionId, assetId: 'late' })
    expect(res).toMatchObject({ status: 'ok' })
  })
})
