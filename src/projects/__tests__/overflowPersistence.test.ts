import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type TemplateProject } from '../../domain'
import { createProjectHandlers } from '../handlers'
import { ASSETS, makeEnv, sampleProject, tempDir, useTempDirCleanup } from './helpers'
import { makePng } from './imageFixtures'

useTempDirCleanup()

/** A project whose artwork lies partly or wholly outside the artboard (negative and oversized geometry). */
function overflowProject(): TemplateProject {
  return sampleProject(ASSETS, (p) => {
    p.layers = p.layers.map((l, i) =>
      i === 0
        ? { ...l, x: -4, y: -250.5, width: 5000, height: 9000, rotation: 12 }
        : { ...l, x: 1150, y: -80, width: 400, height: 400 }
    )
  })
}
const geometry = (p: TemplateProject) =>
  p.layers.map((l) => [l.x, l.y, l.width, l.height, l.rotation])

describe('off-artboard geometry persists exactly', () => {
  it('is valid, and survives Save, reopen on another machine and Save As', async () => {
    const project = overflowProject()
    expect(checkProjectIntegrity(project)).toEqual([])
    const env = await makeEnv()
    const info = await env.service.createNew(project, ASSETS)
    const dir = await tempDir()
    await env.service.saveAs(info.sessionId, project, join(dir, 'one.boothproject'))
    await env.service.saveAs(info.sessionId, project, join(dir, 'two.boothproject'))
    const other = await makeEnv()
    for (const name of ['one', 'two']) {
      const opened = await other.service.openFile(join(dir, `${name}.boothproject`))
      expect(geometry(opened.project)).toEqual(geometry(project))
    }
  })
  it('survives autosave and crash recovery', async () => {
    const project = overflowProject()
    const env = await makeEnv()
    const info = await env.service.createNew(project, ASSETS)
    // an edit (new name) makes it a session worth recovering
    await env.service.updateWorkingCopy(info.sessionId, {
      ...project,
      metadata: { ...project.metadata, name: 'Edited' }
    })
    const next = await makeEnv(env.root)
    await next.service.scanRecovery()
    const rec = await next.service.recover(info.sessionId)
    expect(geometry(rec.project)).toEqual(geometry(project))
  })
})

describe('preview photo picker (no path, no project content)', () => {
  const setup = async (pick: string[] | null) => {
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
    return { env, handlers }
  }
  it('cancel is cancelled; a picture returns bytes, name and size but NOT its path', async () => {
    expect(await (await setup(null)).handlers.pickPreviewPhoto(null)).toEqual({
      status: 'cancelled'
    })
    const dir = await tempDir()
    const file = join(dir, 'guests.png')
    await fs.writeFile(file, makePng({ width: 30, height: 20 }))
    const { handlers, env } = await setup([file])
    const r = await handlers.pickPreviewPhoto(null)
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.value).toMatchObject({
      name: 'guests.png',
      mediaType: 'image/png',
      pixelWidth: 30,
      pixelHeight: 20
    })
    expect(JSON.stringify({ ...r.value, data: undefined })).not.toContain(dir)
    // nothing was copied into any session
    expect(await fs.readdir(env.sessionsRoot).catch(() => [])).toEqual([])
  })
  it('rejects non-images and unsafe SVG with a user-safe error', async () => {
    const dir = await tempDir()
    const txt = join(dir, 'a.txt')
    await fs.writeFile(txt, 'hello')
    const bad = await (await setup([txt])).handlers.pickPreviewPhoto(null)
    expect(bad.status === 'error' && bad.error.code).toBe('unsupported-format')
    const svg = join(dir, 'x.svg')
    await fs.writeFile(
      svg,
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script/></svg>'
    )
    const evil = await (await setup([svg])).handlers.pickPreviewPhoto(null)
    expect(evil.status === 'error' && evil.error.code).toBe('unsafe-svg')
  })
})
