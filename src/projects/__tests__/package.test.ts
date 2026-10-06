import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PersistenceError } from '../errors'
import { openPackage } from '../packageReader'
import { ASSETS, makeEnv, PNG_A, PNG_B, sampleProject, tempDir, useTempDirCleanup } from './helpers'

useTempDirCleanup()

async function expectCode(p: Promise<unknown>, code: string): Promise<PersistenceError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(PersistenceError)
    expect((e as PersistenceError).code).toBe(code)
    return e as PersistenceError
  }
  throw new Error(`Expected PersistenceError(${code}) but nothing was thrown`)
}

describe('package round trip', () => {
  it('saves a project with assets and reopens it elsewhere unchanged', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    expect(info.dirty).toBe(true)
    expect(info.fileName).toBeNull()
    const dest = join(await tempDir(), 'Wedding.boothproject')
    const saved = await a.service.saveAs(info.sessionId, project, dest)
    expect(saved.dirty).toBe(false)
    expect(saved.fileName).toBe('Wedding.boothproject')

    // A different "machine": separate sessions dir and recents; original machine's files are gone.
    await a.service.close(info.sessionId)
    const b = await makeEnv()
    const reopened = await b.service.openFile(dest)
    expect(reopened.project).toEqual(project)
    expect(reopened.dirty).toBe(false)
    expect(reopened.warnings).toEqual([])
    const sessionDir = join(b.sessionsRoot, reopened.sessionId)
    expect(await readFile(join(sessionDir, 'assets/background.png'))).toEqual(PNG_A)
    expect(await readFile(join(sessionDir, 'assets/logo.png'))).toEqual(PNG_B)
  })

  it('contains exactly project.json and the referenced assets', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'x.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    const pkg = await openPackage(dest)
    try {
      expect(pkg.scan.project).toEqual(project)
      expect(pkg.scan.unreferencedEntries).toEqual([])
    } finally {
      pkg.close()
    }
    // No temp files left beside the package.
    expect(await readdir(join(dest, '..'))).toEqual(['x.boothproject'])
  })

  it('stores no absolute paths in the manifest', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'x.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    const pkg = await openPackage(dest)
    try {
      for (const a of pkg.scan.project.assets) expect(a.path.startsWith('assets/')).toBe(true)
    } finally {
      pkg.close()
    }
  })

  it('writes identical bytes for identical input', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dir = await tempDir()
    await env.service.saveAs(info.sessionId, project, join(dir, 'one.boothproject'))
    await env.service.saveAs(info.sessionId, project, join(dir, 'two.boothproject'))
    expect(await readFile(join(dir, 'one.boothproject'))).toEqual(
      await readFile(join(dir, 'two.boothproject'))
    )
  })

  it('works for a project with no assets', async () => {
    const env = await makeEnv()
    const project = sampleProject()
    const info = await env.service.createNew(project)
    const dest = join(await tempDir(), 'empty.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    expect((await env.service.openFile(dest)).project).toEqual(project)
  })
})

describe('save and save as', () => {
  it('Save requires an existing file; Save As associates the file only after success', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    expect(env.service.hasSavedFile(info.sessionId)).toBe(false)
    await expectCode(env.service.save(info.sessionId, project), 'invalid-request')

    const dir = await tempDir()
    const first = join(dir, 'first.boothproject')
    await env.service.saveAs(info.sessionId, project, first)
    expect(env.service.hasSavedFile(info.sessionId)).toBe(true)

    // A failing Save As must not change the association.
    const broken = structuredClone(project)
    broken.assets[0]!.path = 'assets/missing-on-disk.png'
    await expectCode(
      env.service.saveAs(info.sessionId, broken, join(dir, 'second.boothproject')),
      'missing-asset'
    )
    const edited = { ...project, metadata: { ...project.metadata, name: 'Edited' } }
    const afterSave = await env.service.save(info.sessionId, edited)
    expect(afterSave.fileName).toBe('first.boothproject')
    await expect(stat(join(dir, 'second.boothproject'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('Save As leaves the original intact and subsequent Save targets the new file', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dir = await tempDir()
    const original = join(dir, 'original.boothproject')
    const copy = join(dir, 'copy.boothproject')
    await env.service.saveAs(info.sessionId, project, original)
    const before = await readFile(original)

    const renamed = { ...project, metadata: { ...project.metadata, name: 'Renamed' } }
    const res = await env.service.saveAs(info.sessionId, renamed, copy)
    expect(res.fileName).toBe('copy.boothproject')
    expect(await readFile(original)).toEqual(before)

    const edited2 = { ...renamed, metadata: { ...renamed.metadata, name: 'Renamed Again' } }
    await env.service.save(info.sessionId, edited2)
    expect(await readFile(original)).toEqual(before)
    expect((await env.service.openFile(copy)).project.metadata.name).toBe('Renamed Again')
  })

  it('rejects a destination without the .boothproject extension', async () => {
    const env = await makeEnv()
    const project = sampleProject()
    const info = await env.service.createNew(project)
    await expectCode(
      env.service.saveAs(info.sessionId, project, join(await tempDir(), 'x.zip')),
      'invalid-request'
    )
  })

  it('overwrites an existing package on Save and keeps no leftovers', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'p.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    const changed = { ...project, metadata: { ...project.metadata, name: 'v2' } }
    await env.service.save(info.sessionId, changed)
    expect((await env.service.openFile(dest)).project.metadata.name).toBe('v2')
    expect(await readdir(join(dest, '..'))).toEqual(['p.boothproject'])
  })

  it('does not package unreferenced session files', async () => {
    const env = await makeEnv()
    const project = sampleProject([ASSETS[0]!])
    const info = await env.service.createNew(project, [ASSETS[0]!, ASSETS[1]!])
    const dest = join(await tempDir(), 'p.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    const reopened = await env.service.openFile(dest)
    expect(reopened.warnings).toEqual([])
    expect(await readdir(join(env.sessionsRoot, reopened.sessionId, 'assets'))).toEqual([
      'background.png'
    ])
  })

  it('refuses to save when a referenced asset file is gone, keeping the old file', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'p.boothproject')
    await env.service.saveAs(info.sessionId, project, dest)
    const before = await readFile(dest)
    const { rm } = await import('node:fs/promises')
    await rm(join(env.sessionsRoot, info.sessionId, 'assets/logo.png'))
    await expectCode(
      env.service.save(info.sessionId, {
        ...project,
        metadata: { ...project.metadata, name: 'no' }
      }),
      'missing-asset'
    )
    expect(await readFile(dest)).toEqual(before)
  })

  it('keeps the existing file when the replace step fails, and cleans up its temp file', async () => {
    const dir = await tempDir()
    const env = await makeEnv(undefined, {
      rename: async () => {
        throw Object.assign(new Error('simulated'), { code: 'EIO' })
      }
    })
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    const dest = join(dir, 'p.boothproject')
    await writeFile(dest, 'previous good content')
    await expectCode(env.service.saveAs(info.sessionId, project, dest), 'replace-failed')
    expect(await readFile(dest, 'utf8')).toBe('previous good content')
    expect(await readdir(dir)).toEqual(['p.boothproject'])
    // Association unchanged after a failed Save As.
    expect(env.service.hasSavedFile(info.sessionId)).toBe(false)
  })
})

describe('dirty state', () => {
  it('stays dirty after working-copy autosave and becomes clean only after Save', async () => {
    const env = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await env.service.createNew(project, ASSETS)
    expect(info.dirty).toBe(true)
    const dest = join(await tempDir(), 'p.boothproject')
    expect((await env.service.saveAs(info.sessionId, project, dest)).dirty).toBe(false)
    const edited = { ...project, metadata: { ...project.metadata, name: 'Edited' } }
    expect(await env.service.updateWorkingCopy(info.sessionId, edited)).toEqual({ dirty: true })
    expect(await env.service.updateWorkingCopy(info.sessionId, edited)).toEqual({ dirty: true })
    // Reverting to exactly the saved content is clean again relative to the package.
    expect(await env.service.updateWorkingCopy(info.sessionId, project)).toEqual({ dirty: false })
    expect((await env.service.save(info.sessionId, edited)).dirty).toBe(false)
  })
})

describe('service errors', () => {
  it('reports unknown sessions and missing files', async () => {
    const env = await makeEnv()
    await expectCode(env.service.close('nope'), 'session-not-found')
    await expectCode(
      env.service.openFile(join(await tempDir(), 'none.boothproject')),
      'file-not-found'
    )
    await expectCode(env.service.openFile(join(await tempDir(), 'wrong.txt')), 'invalid-request')
  })
})
