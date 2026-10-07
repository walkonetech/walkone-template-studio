import { promises as fs } from 'node:fs'
import { basename, join } from 'node:path'
import { loadProject, type TemplateProject } from '../domain'
import { PersistenceError } from './errors'
import { verifySessionAssets } from './packageWriter'
import {
  listSessions,
  readSessionMeta,
  readWorkingProject,
  sessionDirOf,
  type SessionMeta
} from './session'

/**
 * Crash-recovery policy for working sessions (ADR-034). At startup every session directory left by a PREVIOUS app
 * run is classified; nothing is restored automatically.
 *
 *   endedCleanly                          -> removed (a normal close whose delete failed)
 *   no unsaved work (not changed)         -> removed (nothing worth keeping)
 *   unreadable metadata / invalid project -> moved to quarantine (never crashes startup, never silently deleted)
 *   unsaved work, younger than 30 days    -> recovery candidate (offered to the user)
 *   unsaved work, older than 30 days      -> moved to quarantine (kept, not offered; deleted after 60 more days)
 *
 * Sessions owned by the CURRENT run are skipped by `ownerToken`, so a reused PID can never make a dead session look alive.
 */
export const RECOVERY_RETENTION_DAYS = 30
export const QUARANTINE_RETENTION_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

export type QuarantineReason = 'corrupt-metadata' | 'corrupt-project' | 'expired'
export type RecoveryConflict = 'none' | 'portable-changed' | 'portable-missing'

export interface RecoveryCandidate {
  sessionId: string
  projectId: string
  projectName: string
  /** Portable file this work belongs to, or null for a project that was never saved. */
  originalPath: string | null
  originalFileName: string | null
  neverSaved: boolean
  createdAt: string
  lastWorkingSaveAt: string
  lastPortableSaveAt: string | null
  /** Whether the portable file still matches what the session last saw. */
  conflict: RecoveryConflict
  /** Asset files referenced by the recovered project that are missing from the session. */
  missingAssets: number
}

export interface ScanResult {
  candidates: RecoveryCandidate[]
  removed: string[]
  quarantined: { sessionId: string; reason: QuarantineReason }[]
  purged: string[]
}

export interface ScanOptions {
  sessionsRoot: string
  quarantineRoot: string
  /** Token of the running app instance; its own sessions are never touched. */
  ownerToken: string
  now?: Date
}

async function quarantine(opts: ScanOptions, id: string): Promise<void> {
  await fs.mkdir(opts.quarantineRoot, { recursive: true })
  await fs.rename(
    sessionDirOf(opts.sessionsRoot, id),
    join(opts.quarantineRoot, `${id}-${(opts.now ?? new Date()).getTime()}`)
  )
}

async function portableConflict(meta: SessionMeta): Promise<RecoveryConflict> {
  if (meta.originalPath === null) return 'none'
  try {
    const stat = await fs.stat(meta.originalPath)
    if (!meta.portableFileStamp) return 'none'
    return stat.size === meta.portableFileStamp.size &&
      Math.abs(stat.mtimeMs - meta.portableFileStamp.mtimeMs) < 1
      ? 'none'
      : 'portable-changed'
  } catch {
    return 'portable-missing'
  }
}

async function countMissingAssets(
  sessionDir: string,
  project: Parameters<typeof verifySessionAssets>[1]
): Promise<number> {
  let missing = 0
  for (const asset of project.assets) {
    try {
      await verifySessionAssets(sessionDir, { ...project, assets: [asset] })
    } catch {
      missing++
    }
  }
  return missing
}

export async function scanRecovery(opts: ScanOptions): Promise<ScanResult> {
  const now = opts.now ?? new Date()
  const result: ScanResult = { candidates: [], removed: [], quarantined: [], purged: [] }
  const { sessions, unreadable } = await listSessions(opts.sessionsRoot)

  for (const id of unreadable) {
    try {
      await quarantine(opts, id)
      result.quarantined.push({ sessionId: id, reason: 'corrupt-metadata' })
    } catch {
      // Leave it in place; it will be tried again next launch. Never crash startup.
    }
  }

  for (const { id, meta } of sessions) {
    if (meta.ownerToken !== '' && meta.ownerToken === opts.ownerToken) continue
    const dir = sessionDirOf(opts.sessionsRoot, id)
    try {
      const hasWork = meta.hasUnsavedChanges && meta.changedFromBaseline
      if (meta.endedCleanly || !hasWork) {
        await fs.rm(dir, { recursive: true, force: true })
        result.removed.push(id)
        continue
      }
      let project
      try {
        project = await readWorkingProject({ id, dir })
      } catch {
        await quarantine(opts, id)
        result.quarantined.push({ sessionId: id, reason: 'corrupt-project' })
        continue
      }
      if (now.getTime() - Date.parse(meta.lastWorkingSaveAt) > RECOVERY_RETENTION_DAYS * DAY_MS) {
        await quarantine(opts, id)
        result.quarantined.push({ sessionId: id, reason: 'expired' })
        continue
      }
      result.candidates.push({
        sessionId: id,
        projectId: meta.projectId,
        projectName: meta.projectName || project.metadata.name,
        originalPath: meta.originalPath,
        originalFileName: meta.originalPath ? basename(meta.originalPath) : null,
        neverSaved: meta.lastPortableSaveAt === null && meta.originalPath === null,
        createdAt: meta.createdAt,
        lastWorkingSaveAt: meta.lastWorkingSaveAt,
        lastPortableSaveAt: meta.lastPortableSaveAt,
        conflict: await portableConflict(meta),
        missingAssets: await countMissingAssets(dir, project)
      })
    } catch {
      // A session we cannot even classify is left untouched (and reported next time) rather than deleted.
    }
  }
  result.candidates.sort((a, b) => b.lastWorkingSaveAt.localeCompare(a.lastWorkingSaveAt))

  // Retention for quarantined sessions.
  try {
    for (const name of await fs.readdir(opts.quarantineRoot)) {
      const stat = await fs.stat(join(opts.quarantineRoot, name))
      if (now.getTime() - stat.mtimeMs > QUARANTINE_RETENTION_DAYS * DAY_MS) {
        await fs.rm(join(opts.quarantineRoot, name), { recursive: true, force: true })
        result.purged.push(name)
      }
    }
  } catch {
    // No quarantine folder yet.
  }
  return result
}

/** Loads and validates the recovered project; throws structured recovery errors. */
export async function loadRecoverableProject(
  sessionsRoot: string,
  id: string
): Promise<{
  project: TemplateProject
  meta: SessionMeta
}> {
  const dir = sessionDirOf(sessionsRoot, id)
  const meta = await readSessionMeta(dir).catch((e) => {
    throw new PersistenceError(
      'recovery-corrupt',
      'The recovery data is damaged and cannot be restored.',
      String(e),
      e
    )
  })
  const text = await fs.readFile(join(dir, 'project.json'), 'utf8').catch((e) => {
    throw new PersistenceError(
      'recovery-corrupt',
      'The recovery data is damaged and cannot be restored.',
      String(e),
      e
    )
  })
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    throw new PersistenceError(
      'recovery-corrupt',
      'The recovery data is damaged and cannot be restored.',
      String(e),
      e
    )
  }
  const loaded = loadProject(raw)
  if (!loaded.ok) {
    throw new PersistenceError(
      'recovery-corrupt',
      'The recovery data is damaged and cannot be restored.',
      JSON.stringify(loaded.errors)
    )
  }
  try {
    await verifySessionAssets(dir, loaded.project)
  } catch (e) {
    if (
      e instanceof PersistenceError &&
      (e.code === 'missing-asset' || e.code === 'corrupted-package')
    ) {
      throw new PersistenceError(
        'recovery-asset-missing',
        'Some image files stored with this recovery copy are missing, so it cannot be fully restored.',
        e.detail,
        e
      )
    }
    throw e
  }
  return { project: loaded.project, meta }
}
