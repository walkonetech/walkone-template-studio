import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  createId,
  deserializeProject,
  IdSchema,
  IsoTimestampSchema,
  nowIso,
  serializeProject,
  type TemplateProject
} from '../domain'
import { writeFileAtomic } from './atomicFile'
import { ASSETS_DIR, MANIFEST_NAME, SESSION_META_NAME } from './constants'
import { PersistenceError, fromFsError } from './errors'

/**
 * A working session is an app-managed directory holding the live copy of ONE open project:
 *
 *   <sessionsRoot>/<sessionId>/
 *     project.json   current working manifest (written by saveWorkingSession)
 *     assets/        project-owned asset files
 *     session.json   recovery metadata (below)
 *
 * It is separate from the portable `.boothproject` so frequent autosaves rewrite one small
 * JSON file instead of rebuilding an archive.
 */
export const SessionMetaSchema = z.strictObject({
  sessionVersion: z.literal(1),
  sessionId: IdSchema,
  projectId: IdSchema,
  /** Path of the portable package this session was opened from / last saved to; null if never saved. */
  originalPath: z.string().nullable(),
  createdAt: IsoTimestampSchema,
  /** Last time project.json in the session was written. */
  lastWorkingSaveAt: IsoTimestampSchema,
  /** Last successful portable Save/Save As (or open); null if never. */
  lastPortableSaveAt: IsoTimestampSchema.nullable(),
  /** SHA-256 of the serialized project at the last portable save/open; null if never saved. */
  portableHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
  /** True when the working manifest differs from the last portable save (may hold newer work). */
  hasUnsavedChanges: z.boolean(),
  ownerPid: z.number().int().nonnegative()
})
export type SessionMeta = z.infer<typeof SessionMetaSchema>

export interface InitialAsset {
  /** Project-relative path, e.g. `assets/logo.png`. */
  path: string
  data: Uint8Array
}

export interface WorkingSession {
  readonly id: string
  readonly dir: string
}

export const hashText = (text: string): string => createHash('sha256').update(text).digest('hex')

export function sessionDirOf(root: string, id: string): string {
  return join(root, id)
}

async function writeMeta(session: WorkingSession, meta: SessionMeta): Promise<void> {
  await writeFileAtomic(join(session.dir, SESSION_META_NAME), JSON.stringify(meta, null, 2) + '\n')
}

export async function readSessionMeta(dir: string): Promise<SessionMeta> {
  let text: string
  try {
    text = await fs.readFile(join(dir, SESSION_META_NAME), 'utf8')
  } catch (e) {
    throw fromFsError(e, 'session-not-found', 'The working session could not be read.')
  }
  try {
    return SessionMetaSchema.parse(JSON.parse(text))
  } catch (e) {
    throw new PersistenceError(
      'corrupted-package',
      'The working session metadata is damaged.',
      String(e),
      e
    )
  }
}

export interface CreateSessionInput {
  project: TemplateProject
  originalPath: string | null
  /** Set when the project came from a verified portable package, so it starts clean. */
  portableHash: string | null
  lastPortableSaveAt?: string | null
  initialAssets?: InitialAsset[]
}

/** Creates a fresh session directory (never reuses one) and writes its manifest and metadata. */
export async function createWorkingSession(
  root: string,
  input: CreateSessionInput
): Promise<WorkingSession> {
  const id = createId()
  const session: WorkingSession = { id, dir: sessionDirOf(root, id) }
  try {
    await fs.mkdir(join(session.dir, ASSETS_DIR), { recursive: true })
    for (const asset of input.initialAssets ?? []) {
      const target = join(session.dir, ...asset.path.split('/'))
      await fs.mkdir(join(target, '..'), { recursive: true })
      await fs.writeFile(target, asset.data, { flag: 'wx' })
    }
    const text = serializeProject(input.project)
    await fs.writeFile(join(session.dir, MANIFEST_NAME), text, 'utf8')
    const now = nowIso()
    await writeMeta(session, {
      sessionVersion: 1,
      sessionId: id,
      projectId: input.project.id,
      originalPath: input.originalPath,
      createdAt: now,
      lastWorkingSaveAt: now,
      lastPortableSaveAt: input.lastPortableSaveAt ?? null,
      portableHash: input.portableHash,
      hasUnsavedChanges: input.portableHash === null || input.portableHash !== hashText(text),
      ownerPid: process.pid
    })
  } catch (e) {
    await fs.rm(session.dir, { recursive: true, force: true })
    throw e instanceof PersistenceError
      ? e
      : fromFsError(e, 'write-failed', 'The working session could not be created.')
  }
  return session
}

/**
 * Autosave foundation: writes the current project into the session's project.json and updates
 * metadata. Does NOT touch the portable package and never makes the project "clean".
 * Returns whether the project now differs from the last portable save.
 */
export async function saveWorkingSession(
  session: WorkingSession,
  project: TemplateProject
): Promise<{ dirty: boolean }> {
  const meta = await readSessionMeta(session.dir)
  if (meta.projectId !== project.id) {
    throw new PersistenceError('invalid-request', 'The project does not belong to this session.')
  }
  const text = serializeProject(project)
  await writeFileAtomic(join(session.dir, MANIFEST_NAME), text)
  const dirty = meta.portableHash === null || meta.portableHash !== hashText(text)
  await writeMeta(session, { ...meta, lastWorkingSaveAt: nowIso(), hasUnsavedChanges: dirty })
  return { dirty }
}

/** Records a successful portable save: the project is now clean relative to `path`. */
export async function markPortableSaved(
  session: WorkingSession,
  project: TemplateProject,
  path: string
): Promise<void> {
  const meta = await readSessionMeta(session.dir)
  const text = serializeProject(project)
  const now = nowIso()
  await writeFileAtomic(join(session.dir, MANIFEST_NAME), text)
  await writeMeta(session, {
    ...meta,
    originalPath: path,
    lastWorkingSaveAt: now,
    lastPortableSaveAt: now,
    portableHash: hashText(text),
    hasUnsavedChanges: false
  })
}

/** Reads the working manifest back (e.g., for recovery). */
export async function readWorkingProject(session: WorkingSession): Promise<TemplateProject> {
  const text = await fs.readFile(join(session.dir, MANIFEST_NAME), 'utf8')
  const result = deserializeProject(text)
  if (!result.ok) {
    throw new PersistenceError(
      'invalid-project',
      'The working copy is invalid.',
      JSON.stringify(result.errors)
    )
  }
  return result.project
}

export async function removeSession(root: string, id: string): Promise<void> {
  await fs.rm(sessionDirOf(root, id), { recursive: true, force: true })
}

export interface SessionListing {
  id: string
  meta: SessionMeta
}

/**
 * Lists sessions found on disk (for startup cleanup/recovery). Unreadable directories are
 * returned in `unreadable` rather than ignored. Recovery strategy (proposed, not built):
 * on launch, sessions with `hasUnsavedChanges` and a dead `ownerPid` are offered for recovery;
 * clean stale sessions and unreadable ones are deleted; closing a project normally deletes its session.
 */
export async function listSessions(
  root: string
): Promise<{ sessions: SessionListing[]; unreadable: string[] }> {
  let names: string[]
  try {
    names = await fs.readdir(root)
  } catch {
    return { sessions: [], unreadable: [] }
  }
  const sessions: SessionListing[] = []
  const unreadable: string[] = []
  for (const name of names) {
    try {
      sessions.push({ id: name, meta: await readSessionMeta(join(root, name)) })
    } catch {
      unreadable.push(name)
    }
  }
  return { sessions, unreadable }
}
