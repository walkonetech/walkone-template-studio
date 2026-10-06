import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PersistenceError } from '../errors'
import {
  createWorkingSession,
  hashText,
  listSessions,
  markPortableSaved,
  readSessionMeta,
  readWorkingProject,
  removeSession,
  saveWorkingSession
} from '../session'
import { serializeProject } from '../../domain'
import { ASSETS, sampleProject, tempDir, useTempDirCleanup } from './helpers'

useTempDirCleanup()

describe('working session', () => {
  it('creates a unique directory with manifest, assets and metadata', async () => {
    const root = await tempDir()
    const project = sampleProject(ASSETS)
    const a = await createWorkingSession(root, {
      project,
      originalPath: null,
      portableHash: null,
      initialAssets: ASSETS
    })
    const b = await createWorkingSession(root, { project, originalPath: null, portableHash: null })
    expect(a.id).not.toBe(b.id)
    expect((await readdir(root)).sort()).toEqual([a.id, b.id].sort())
    expect((await readdir(a.dir)).sort()).toEqual(['assets', 'project.json', 'session.json'])
    expect(await readdir(join(a.dir, 'assets'))).toEqual(['background.png', 'logo.png'])
    const meta = await readSessionMeta(a.dir)
    expect(meta).toMatchObject({
      projectId: project.id,
      originalPath: null,
      hasUnsavedChanges: true,
      lastPortableSaveAt: null,
      ownerPid: process.pid
    })
  })

  it('persists the working manifest without touching a portable package, and tracks unsaved changes', async () => {
    const root = await tempDir()
    const project = sampleProject()
    const s = await createWorkingSession(root, {
      project,
      originalPath: '/some/where.boothproject',
      portableHash: hashText(serializeProject(project)),
      lastPortableSaveAt: '2026-01-01T00:00:00.000Z'
    })
    expect((await readSessionMeta(s.dir)).hasUnsavedChanges).toBe(false)
    const edited = { ...project, metadata: { ...project.metadata, name: 'Edited' } }
    expect(await saveWorkingSession(s, edited)).toEqual({ dirty: true })
    expect((await readWorkingProject(s)).metadata.name).toBe('Edited')
    const meta = await readSessionMeta(s.dir)
    expect(meta.hasUnsavedChanges).toBe(true)
    expect(meta.lastPortableSaveAt).toBe('2026-01-01T00:00:00.000Z')
    await markPortableSaved(s, edited, '/new/path.boothproject')
    const after = await readSessionMeta(s.dir)
    expect(after).toMatchObject({
      hasUnsavedChanges: false,
      originalPath: '/new/path.boothproject'
    })
    expect(after.lastPortableSaveAt).not.toBeNull()
  })

  it('refuses a project that belongs to another session', async () => {
    const root = await tempDir()
    const s = await createWorkingSession(root, {
      project: sampleProject(),
      originalPath: null,
      portableHash: null
    })
    await expect(saveWorkingSession(s, sampleProject())).rejects.toBeInstanceOf(PersistenceError)
  })

  it('lists sessions for recovery and reports unreadable ones', async () => {
    const root = await tempDir()
    const s = await createWorkingSession(root, {
      project: sampleProject(),
      originalPath: null,
      portableHash: null
    })
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(root, 'junk'))
    const listing = await listSessions(root)
    expect(listing.sessions.map((x) => x.id)).toEqual([s.id])
    expect(listing.unreadable).toEqual(['junk'])
    expect(await listSessions(join(root, 'does-not-exist'))).toEqual({
      sessions: [],
      unreadable: []
    })
  })

  it('cleans up completely', async () => {
    const root = await tempDir()
    const s = await createWorkingSession(root, {
      project: sampleProject(ASSETS),
      originalPath: null,
      portableHash: null,
      initialAssets: ASSETS
    })
    await removeSession(root, s.id)
    await expect(stat(s.dir)).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })

  it('does not keep a half-built session if creation fails', async () => {
    const root = await tempDir()
    const bad = sampleProject(ASSETS)
    bad.layers.push({ ...bad.layers[0]! })
    await expect(
      createWorkingSession(root, { project: bad, originalPath: null, portableHash: null })
    ).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  })

  it('reads metadata back from a fresh process view', async () => {
    const root = await tempDir()
    const s = await createWorkingSession(root, {
      project: sampleProject(),
      originalPath: null,
      portableHash: null
    })
    expect(JSON.parse(await readFile(join(s.dir, 'session.json'), 'utf8')).sessionId).toBe(s.id)
  })
})
