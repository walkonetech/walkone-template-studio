import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type TemplateProject } from '../../domain'
import { ASSETS, makeEnv, sampleProject, tempDir, useTempDirCleanup } from './helpers'

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
