import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PersistenceError } from '../errors'
import { QUARANTINE_RETENTION_DAYS, RECOVERY_RETENTION_DAYS, scanRecovery } from '../recovery'
import { createWorkingSession, hashText, markPortableSaved, readSessionMeta } from '../session'
import { createHandlersFor } from './handlerHelpers'
import { ASSETS, makeEnv, sampleProject, tempDir, useTempDirCleanup, type Env } from './helpers'
import { serializeProject } from '../../domain'

useTempDirCleanup()

const edited = (p: ReturnType<typeof sampleProject>, name = 'Edited') => ({
  ...p,
  metadata: { ...p.metadata, name }
})

/** Simulates a crash: the old "app run" is abandoned (never closed) and a NEW run (new owner token) starts scanning. */
async function nextRun(old: Env): Promise<Env> {
  return makeEnv(old.root)
}

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    return e instanceof PersistenceError ? e.code : String(e)
  }
  return 'no error'
}

describe('what counts as recoverable', () => {
  it('a modified, never-saved project is a recovery candidate and recovers as an unsaved project', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project, 'Lost wedding'))
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates).toHaveLength(1)
    expect(scan.candidates[0]).toMatchObject({
      projectName: 'Lost wedding',
      neverSaved: true,
      originalFileName: null,
      conflict: 'none',
      missingAssets: 0
    })
    const rec = await b.service.recover(info.sessionId)
    expect(rec.dirty).toBe(true)
    expect(rec.fileName).toBeNull()
    expect(rec.project.metadata.name).toBe('Lost wedding')
    expect(b.service.hasSavedFile(rec.sessionId)).toBe(false)
    // untitled recovery eventually needs Save As, which works and makes it clean
    const dest = join(await tempDir(), 'Recovered.boothproject')
    const saved = await b.service.saveAs(rec.sessionId, rec.project, dest)
    expect(saved).toMatchObject({ dirty: false, fileName: 'Recovered.boothproject' })
  })

  it('an untouched untitled project is NOT a candidate and is cleaned up', async () => {
    const a = await makeEnv()
    await a.service.createNew(sampleProject(ASSETS), ASSETS)
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates).toEqual([])
    expect(scan.removed).toHaveLength(1)
    expect(await fs.readdir(b.sessionsRoot)).toEqual([])
  })

  it('a clean opened package (no edits) is cleaned up, never offered', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'p.boothproject')
    await a.service.saveAs(info.sessionId, project, dest)
    await a.service.close(info.sessionId)
    await a.service.openFile(dest)
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates).toEqual([])
    expect(scan.removed.length).toBeGreaterThanOrEqual(1)
  })

  it('a saved project modified afterwards is recoverable, keeps its file association, and is recovered Modified', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'Client.boothproject')
    await a.service.saveAs(info.sessionId, project, dest)
    const before = await fs.readFile(dest)
    await a.service.updateWorkingCopy(info.sessionId, edited(project, 'Client v2'))
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates[0]).toMatchObject({
      neverSaved: false,
      originalFileName: 'Client.boothproject',
      conflict: 'none'
    })
    const rec = await b.service.recover(info.sessionId)
    expect(rec).toMatchObject({ dirty: true, fileName: 'Client.boothproject' })
    expect(await fs.readFile(dest)).toEqual(before) // recovering never overwrites the portable file
    const saved = await b.service.save(rec.sessionId, rec.project)
    expect(saved.dirty).toBe(false)
    expect((await b.service.openFile(dest)).project.metadata.name).toBe('Client v2')
  })

  it('project-owned assets survive recovery and are readable', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const b = await nextRun(a)
    await b.service.scanRecovery()
    const rec = await b.service.recover(info.sessionId)
    const asset = rec.project.assets[0]!
    const bytes = await b.service.readAsset(rec.sessionId, asset.id)
    expect(bytes.data.length).toBe(asset.byteSize)
  })
})

describe('portable file conflicts', () => {
  async function savedAndEdited() {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'Shared.boothproject')
    await a.service.saveAs(info.sessionId, project, dest)
    await a.service.updateWorkingCopy(info.sessionId, edited(project, 'Mine'))
    return { a, info, dest, project }
  }

  it('an externally changed portable file is flagged; recovery succeeds in memory WITHOUT association and never overwrites', async () => {
    const { a, info, dest } = await savedAndEdited()
    await fs.writeFile(dest, Buffer.concat([await fs.readFile(dest), Buffer.from('tampered')]))
    const external = await fs.readFile(dest)
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates[0]?.conflict).toBe('portable-changed')
    const rec = await b.service.recover(info.sessionId)
    expect(rec.dirty).toBe(true)
    expect(rec.fileName).toBeNull() // Save would be Save As, so the other side is not silently overwritten
    expect(rec.warnings.join(' ')).toMatch(/changed/)
    expect(b.service.hasSavedFile(rec.sessionId)).toBe(false)
    expect(await fs.readFile(dest)).toEqual(external)
  })

  it('a missing portable file is flagged and recovery drops the association', async () => {
    const { a, info, dest } = await savedAndEdited()
    await fs.rm(dest)
    const b = await nextRun(a)
    expect((await b.service.scanRecovery()).candidates[0]?.conflict).toBe('portable-missing')
    const rec = await b.service.recover(info.sessionId)
    expect(rec.fileName).toBeNull()
    expect(rec.warnings.join(' ')).toMatch(/no longer there/)
  })
})

describe('discard, assets and corruption', () => {
  it('discard removes only the session, never the portable file, and cannot be repeated', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'Keep.boothproject')
    await a.service.saveAs(info.sessionId, project, dest)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const before = await fs.readFile(dest)
    const b = await nextRun(a)
    await b.service.scanRecovery()
    await b.service.discardRecovery(info.sessionId)
    expect(await fs.readdir(b.sessionsRoot)).toEqual([])
    expect(await fs.readFile(dest)).toEqual(before)
    expect(await code(b.service.discardRecovery(info.sessionId))).toBe('session-not-found')
  })

  it('a missing asset file gives a controlled recovery-asset-missing error and keeps the candidate for discard', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    await fs.rm(join(a.sessionsRoot, info.sessionId, 'assets/logo.png'))
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates[0]?.missingAssets).toBe(1)
    expect(await code(b.service.recover(info.sessionId))).toBe('recovery-asset-missing')
    expect(b.service.listRecovery()).toHaveLength(1)
    await b.service.discardRecovery(info.sessionId)
    expect(b.service.listRecovery()).toHaveLength(0)
  })

  it('corrupt session metadata is quarantined, not fatal, and not offered', async () => {
    const a = await makeEnv()
    const info = await a.service.createNew(sampleProject(ASSETS), ASSETS)
    await fs.writeFile(join(a.sessionsRoot, info.sessionId, 'session.json'), '{ not json')
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.candidates).toEqual([])
    expect(scan.quarantined).toEqual([{ sessionId: info.sessionId, reason: 'corrupt-metadata' }])
    expect((await fs.readdir(join(b.root, 'session-quarantine'))).length).toBe(1)
    expect(await fs.readdir(b.sessionsRoot)).toEqual([])
  })

  it('a corrupt working manifest is quarantined', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    await fs.writeFile(join(a.sessionsRoot, info.sessionId, 'project.json'), '{"schemaVersion":1}')
    const b = await nextRun(a)
    const scan = await b.service.scanRecovery()
    expect(scan.quarantined[0]).toMatchObject({ reason: 'corrupt-project' })
  })

  it('recover rejects data that became corrupt after the scan', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const b = await nextRun(a)
    await b.service.scanRecovery()
    await fs.writeFile(join(b.sessionsRoot, info.sessionId, 'project.json'), 'garbage')
    expect(await code(b.service.recover(info.sessionId))).toBe('recovery-corrupt')
  })
})

describe('retention, ownership and clean shutdown', () => {
  it('unsaved work older than the retention window is quarantined (kept, not offered); recent work is kept offered', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const old = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(old.sessionId, edited(project))
    const future = new Date(Date.now() + (RECOVERY_RETENTION_DAYS + 1) * 86400000)
    const fresh = await scanRecovery({
      sessionsRoot: a.sessionsRoot,
      quarantineRoot: join(a.root, 'q'),
      ownerToken: 'other-run'
    })
    expect(fresh.candidates).toHaveLength(1)
    const later = await scanRecovery({
      sessionsRoot: a.sessionsRoot,
      quarantineRoot: join(a.root, 'q'),
      ownerToken: 'other-run',
      now: future
    })
    expect(later.candidates).toHaveLength(0)
    expect(later.quarantined).toEqual([{ sessionId: old.sessionId, reason: 'expired' }])
  })

  it('quarantined sessions are purged only after the quarantine retention', async () => {
    const root = await tempDir()
    const q = join(root, 'q')
    await fs.mkdir(join(q, 'old-one'), { recursive: true })
    await fs.mkdir(join(q, 'young-one'), { recursive: true })
    const oldDate = new Date(Date.now() - (QUARANTINE_RETENTION_DAYS + 1) * 86400000)
    await fs.utimes(join(q, 'old-one'), oldDate, oldDate)
    const r = await scanRecovery({
      sessionsRoot: join(root, 's'),
      quarantineRoot: q,
      ownerToken: 't'
    })
    expect(r.purged).toEqual(['old-one'])
    expect(await fs.readdir(q)).toEqual(['young-one'])
  })

  it('sessions of the CURRENT run are never touched, whatever their state (PID reuse cannot fool the scan)', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const scan = await a.service.scanRecovery() // same service => same ownerToken
    expect(scan.candidates).toEqual([])
    expect(scan.removed).toEqual([])
    expect(await fs.readdir(a.sessionsRoot)).toEqual([info.sessionId])
  })

  it('sessions flagged as ended cleanly are removed, not offered', async () => {
    const root = await tempDir()
    const project = sampleProject(ASSETS)
    const session = await createWorkingSession(join(root, 's'), {
      project,
      originalPath: null,
      portableHash: null,
      initialAssets: ASSETS,
      ownerToken: 'dead'
    })
    const metaPath = join(session.dir, 'session.json')
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'))
    await fs.writeFile(
      metaPath,
      JSON.stringify({
        ...meta,
        endedCleanly: true,
        hasUnsavedChanges: true,
        changedFromBaseline: true
      })
    )
    const r = await scanRecovery({
      sessionsRoot: join(root, 's'),
      quarantineRoot: join(root, 'q'),
      ownerToken: 'now'
    })
    expect(r.candidates).toEqual([])
    expect(r.removed).toEqual([session.id])
  })

  it('closeAll removes every open session (the normal close/quit path) and leaves nothing to recover', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    await a.service.closeAll()
    expect(await fs.readdir(a.sessionsRoot)).toEqual([])
    const b = await nextRun(a)
    expect((await b.service.scanRecovery()).candidates).toEqual([])
  })

  it('without closeAll (an abrupt end) the modified session survives for the next launch', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const b = await nextRun(a)
    expect((await b.service.scanRecovery()).candidates.map((c) => c.sessionId)).toEqual([
      info.sessionId
    ])
  })
})

describe('session metadata for recovery decisions', () => {
  it('records name, baseline, change flag, owner and portable stamp; autosave never clears unsaved changes', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dir = join(a.sessionsRoot, info.sessionId)
    let meta = await readSessionMeta(dir)
    expect(meta).toMatchObject({
      projectName: 'Persist Test',
      changedFromBaseline: false,
      hasUnsavedChanges: true,
      endedCleanly: false,
      originalPath: null,
      lastPortableSaveAt: null
    })
    expect(meta.ownerToken).toBe(a.service.ownerToken)
    expect(meta.ownerPid).toBe(process.pid)
    expect(meta.baselineHash).toBe(hashText(serializeProject(project)))
    await a.service.updateWorkingCopy(info.sessionId, edited(project, 'Renamed'))
    meta = await readSessionMeta(dir)
    expect(meta).toMatchObject({
      projectName: 'Renamed',
      changedFromBaseline: true,
      hasUnsavedChanges: true
    })
    const dest = join(await tempDir(), 'm.boothproject')
    await a.service.saveAs(info.sessionId, edited(project, 'Renamed'), dest)
    meta = await readSessionMeta(dir)
    expect(meta).toMatchObject({
      hasUnsavedChanges: false,
      changedFromBaseline: false,
      originalPath: dest
    })
    expect(meta.portableFileStamp?.size).toBeGreaterThan(0)
    expect(meta.lastPortableSaveAt).not.toBeNull()
    await a.service.updateWorkingCopy(info.sessionId, edited(project, 'Renamed again'))
    expect((await readSessionMeta(dir)).hasUnsavedChanges).toBe(true)
  })

  it('markPortableSaved resets the baseline', async () => {
    const root = await tempDir()
    const project = sampleProject()
    const s = await createWorkingSession(root, { project, originalPath: null, portableHash: null })
    await markPortableSaved(s, project, '/x.boothproject', { mtimeMs: 1, size: 2 })
    expect(await readSessionMeta(s.dir)).toMatchObject({
      changedFromBaseline: false,
      portableFileStamp: { mtimeMs: 1, size: 2 }
    })
  })
})

describe('recovery IPC handlers', () => {
  it('lists candidates without file-system paths and recovers/discards through validated requests', async () => {
    const a = await makeEnv()
    const project = sampleProject(ASSETS)
    const info = await a.service.createNew(project, ASSETS)
    const dest = join(await tempDir(), 'H.boothproject')
    await a.service.saveAs(info.sessionId, project, dest)
    await a.service.updateWorkingCopy(info.sessionId, edited(project))
    const b = await nextRun(a)
    await b.service.scanRecovery()
    const h = createHandlersFor(b)
    const list = await h.recoveryList()
    if (list.status !== 'ok') throw new Error('expected ok')
    expect(list.value.candidates).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(b.root)
    expect(JSON.stringify(list)).not.toContain(dest)
    expect(list.value.candidates[0]).toMatchObject({ originalFileName: 'H.boothproject' })
    expect(await h.recoveryRecover({ sessionId: 'x', extra: 1 })).toMatchObject({
      status: 'error',
      error: { code: 'invalid-request' }
    })
    expect(await h.recoveryRecover({ sessionId: 'nope' })).toMatchObject({
      status: 'error',
      error: { code: 'session-not-found' }
    })
    expect(await h.recoveryRecover({ sessionId: info.sessionId })).toMatchObject({
      status: 'ok',
      value: { dirty: true, fileName: 'H.boothproject' }
    })
    expect(await h.recoveryDiscard({ sessionId: info.sessionId })).toMatchObject({
      status: 'error'
    }) // already recovered/opened
  })
})
