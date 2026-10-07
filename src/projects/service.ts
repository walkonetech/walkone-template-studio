import { basename } from 'node:path'
import { promises as fs } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { randomBytes } from 'node:crypto'
import { loadProject, serializeProject, type AssetReference, type TemplateProject } from '../domain'
import { defaultFsOps, type FsOps } from './atomicFile'
import { PersistenceError, fromFsError } from './errors'
import { openPackage } from './packageReader'
import { verifySessionAssets, writePackage } from './packageWriter'
import type { RecentProjectsStore } from './recents'
import {
  loadRecoverableProject,
  scanRecovery,
  type RecoveryCandidate,
  type ScanResult
} from './recovery'
import {
  adoptSessionOwnership,
  createWorkingSession,
  hashText,
  markEndedCleanly,
  markPortableSaved,
  removeSession,
  saveWorkingSession,
  type InitialAsset,
  type WorkingSession
} from './session'
import { PROJECT_EXTENSION } from './constants'

/** What the renderer is allowed to know about an open project. No internal paths. */
export interface OpenProjectInfo {
  sessionId: string
  project: TemplateProject
  /** File name of the portable package, or null if the project has never been saved. */
  fileName: string | null
  /** True when there are changes not yet written by a successful Save/Save As. */
  dirty: boolean
  /** Non-fatal notes, e.g. files in the package that were not carried over. */
  warnings: string[]
}

interface OpenEntry {
  session: WorkingSession
  filePath: string | null
  /** Assets of the latest known project, by id (what readAsset may serve). */
  assets: Map<string, AssetReference>
}

/** Largest single asset the renderer may request over IPC. */
export const MAX_ASSET_READ_BYTES = 256 * 1024 * 1024

async function stampOf(path: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const s = await fs.stat(path)
    return { mtimeMs: s.mtimeMs, size: s.size }
  } catch {
    return null
  }
}

const indexAssets = (project: TemplateProject): Map<string, AssetReference> =>
  new Map(project.assets.map((a) => [a.id, a]))

export interface ProjectServiceOptions {
  sessionsRoot: string
  /** Where unusable recovery sessions are set aside (default: a sibling of sessionsRoot). */
  quarantineRoot?: string
  /** Identifies this app run; sessions carrying it are never treated as abandoned. */
  ownerToken?: string
  recents: RecentProjectsStore
  fsOps?: FsOps
}

/**
 * Project lifecycle: create, open, save, save as, working-copy updates, close. Pure Node (no
 * Electron, no React), so it is unit-testable. State per open project lives in a working
 * session; dirty = "differs from the last successful portable save" and becomes false only
 * after Save/Save As succeeds or a package is opened (autosave never clears it).
 */
export class ProjectService {
  private readonly open = new Map<string, OpenEntry>()
  private readonly fsOps: FsOps

  readonly ownerToken: string
  private readonly quarantineRoot: string
  private recovery: ScanResult = { candidates: [], removed: [], quarantined: [], purged: [] }

  constructor(private readonly options: ProjectServiceOptions) {
    this.fsOps = options.fsOps ?? defaultFsOps
    this.ownerToken = options.ownerToken ?? randomBytes(8).toString('hex')
    this.quarantineRoot =
      options.quarantineRoot ?? join(options.sessionsRoot, '..', 'session-quarantine')
  }

  private entry(sessionId: string): OpenEntry {
    const e = this.open.get(sessionId)
    if (!e) throw new PersistenceError('session-not-found', 'That project is not open.')
    return e
  }

  private info(
    e: OpenEntry,
    project: TemplateProject,
    dirty: boolean,
    warnings: string[] = []
  ): OpenProjectInfo {
    return {
      sessionId: e.session.id,
      project,
      fileName: e.filePath ? basename(e.filePath) : null,
      dirty,
      warnings
    }
  }

  /** Whether the project already has a package on disk (so Save needs no dialog). */
  hasSavedFile(sessionId: string): boolean {
    return this.entry(sessionId).filePath !== null
  }

  /** Starts a never-saved project (dirty until first Save As). */
  async createNew(
    project: TemplateProject,
    initialAssets: InitialAsset[] = []
  ): Promise<OpenProjectInfo> {
    const valid = loadProject(project)
    if (!valid.ok)
      throw new PersistenceError(
        'invalid-project',
        'The new project is not valid.',
        JSON.stringify(valid.errors)
      )
    const session = await createWorkingSession(this.options.sessionsRoot, {
      project,
      originalPath: null,
      portableHash: null,
      initialAssets,
      ownerToken: this.ownerToken
    })
    const entry: OpenEntry = { session, filePath: null, assets: indexAssets(project) }
    this.open.set(session.id, entry)
    return this.info(entry, project, true)
  }

  /** Opens a `.boothproject`: validates it, extracts assets into a new session, returns clean state. */
  async openFile(path: string): Promise<OpenProjectInfo> {
    const pkg = await openPackage(path)
    let session: WorkingSession | undefined
    try {
      const { project, unreferencedEntries } = pkg.scan
      session = await createWorkingSession(this.options.sessionsRoot, {
        project,
        originalPath: path,
        portableHash: hashText(serializeProject(project)),
        lastPortableSaveAt: new Date().toISOString(),
        ownerToken: this.ownerToken,
        portableFileStamp: await stampOf(path)
      })
      await pkg.extractAssets(session.dir)
      const entry: OpenEntry = { session, filePath: path, assets: indexAssets(project) }
      this.open.set(session.id, entry)
      await this.options.recents.add({ path, projectId: project.id, name: project.metadata.name })
      const warnings = unreferencedEntries.length
        ? [
            `${unreferencedEntries.length} unused file(s) in the package were not carried over: ${unreferencedEntries.join(', ')}`
          ]
        : []
      return this.info(entry, project, false, warnings)
    } catch (e) {
      if (session) await removeSession(this.options.sessionsRoot, session.id)
      throw e
    } finally {
      pkg.close()
    }
  }

  /** Records the renderer's current project into the working session (autosave foundation). */
  async updateWorkingCopy(
    sessionId: string,
    project: TemplateProject
  ): Promise<{ dirty: boolean }> {
    const entry = this.entry(sessionId)
    const result = await saveWorkingSession(entry.session, project)
    entry.assets = indexAssets(project)
    return result
  }

  /**
   * Bytes of a project-owned asset, addressed by session + asset id. The renderer never supplies a
   * path: the path comes from the validated project record and is confined to the session's assets/.
   */
  async readAsset(
    sessionId: string,
    assetId: string
  ): Promise<{ mediaType: string; data: Uint8Array }> {
    const entry = this.entry(sessionId)
    const asset = entry.assets.get(assetId)
    if (!asset)
      throw new PersistenceError('missing-asset', 'That asset is not part of the project.')
    const root = resolve(entry.session.dir, 'assets') + sep
    const file = resolve(join(entry.session.dir, ...asset.path.split('/')))
    if (!file.startsWith(root)) {
      throw new PersistenceError(
        'unsafe-path',
        'The asset path is outside the project.',
        asset.path
      )
    }
    try {
      const stat = await fs.stat(file)
      if (!stat.isFile())
        throw new PersistenceError('missing-asset', 'The asset is not a file.', asset.path)
      if (stat.size > MAX_ASSET_READ_BYTES) {
        throw new PersistenceError('invalid-request', 'The asset is too large to load.', asset.path)
      }
      return { mediaType: asset.mediaType, data: new Uint8Array(await fs.readFile(file)) }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new PersistenceError('missing-asset', 'The asset file is missing.', asset.path, e)
      }
      throw fromFsError(e, 'missing-asset', 'The asset file could not be read.')
    }
  }

  /** Saves to the project's existing package. Fails with `invalid-request` if it has none yet. */
  async save(sessionId: string, project: TemplateProject): Promise<OpenProjectInfo> {
    const e = this.entry(sessionId)
    if (!e.filePath)
      throw new PersistenceError(
        'invalid-request',
        'This project has not been saved yet. Use Save As.'
      )
    return this.write(e, project, e.filePath)
  }

  /** Writes to a new location; the project's file association changes only after success. */
  async saveAs(
    sessionId: string,
    project: TemplateProject,
    destPath: string
  ): Promise<OpenProjectInfo> {
    const e = this.entry(sessionId)
    return this.write(e, project, destPath)
  }

  private async write(
    e: OpenEntry,
    project: TemplateProject,
    destPath: string
  ): Promise<OpenProjectInfo> {
    if (!destPath.toLowerCase().endsWith(PROJECT_EXTENSION)) {
      throw new PersistenceError(
        'invalid-request',
        `Project files must end in ${PROJECT_EXTENSION}.`
      )
    }
    await saveWorkingSession(e.session, project)
    await verifySessionAssets(e.session.dir, project)
    await writePackage({ sessionDir: e.session.dir, project, destPath, fsOps: this.fsOps })
    await markPortableSaved(e.session, project, destPath, await stampOf(destPath))
    e.filePath = destPath
    await this.options.recents.add({
      path: destPath,
      projectId: project.id,
      name: project.metadata.name
    })
    return this.info(e, project, false)
  }

  /** Closes a project and deletes its session. The caller is responsible for unsaved-change prompts. */
  async close(sessionId: string): Promise<void> {
    const e = this.entry(sessionId)
    this.open.delete(sessionId)
    await removeSession(this.options.sessionsRoot, e.session.id).catch((err) => {
      throw fromFsError(err, 'write-failed', 'The working session could not be cleaned up.')
    })
  }

  /**
   * Deletes the working sessions of every open project. Call ONLY after the user's close/quit was approved
   * (clean, saved, or explicitly discarded): it is what makes a normal close leave no recovery data behind.
   * A session whose delete fails is first flagged `endedCleanly` so it is never offered for recovery.
   */
  async closeAll(): Promise<void> {
    for (const [id, e] of [...this.open]) {
      await markEndedCleanly(e.session).catch(() => undefined)
      await removeSession(this.options.sessionsRoot, e.session.id).catch(() => undefined)
      this.open.delete(id)
    }
  }

  /** Startup scan: classify sessions left by earlier runs (see recovery.ts). Never throws for bad sessions. */
  async scanRecovery(): Promise<ScanResult> {
    this.recovery = await scanRecovery({
      sessionsRoot: this.options.sessionsRoot,
      quarantineRoot: this.quarantineRoot,
      ownerToken: this.ownerToken
    })
    return this.recovery
  }

  listRecovery(): RecoveryCandidate[] {
    return this.recovery.candidates
  }

  lastScan(): ScanResult {
    return this.recovery
  }

  /**
   * Restores a recovery candidate into the open set WITHOUT touching the portable file. The project comes back
   * Modified. The file association is kept only when the portable file still matches what the session last saw;
   * on a conflict (changed or missing) the association is dropped, so Save becomes Save As and nothing is overwritten.
   */
  async recover(sessionId: string): Promise<OpenProjectInfo> {
    const candidate = this.recovery.candidates.find((c) => c.sessionId === sessionId)
    if (!candidate)
      throw new PersistenceError('session-not-found', 'That recovery copy is no longer available.')
    if (this.open.has(sessionId))
      throw new PersistenceError('invalid-request', 'That recovery copy is already open.')
    const { project } = await loadRecoverableProject(this.options.sessionsRoot, sessionId)
    const keepAssociation = candidate.conflict === 'none' && candidate.originalPath !== null
    const session: WorkingSession = {
      id: sessionId,
      dir: join(this.options.sessionsRoot, sessionId)
    }
    await adoptSessionOwnership(
      session,
      this.ownerToken,
      keepAssociation ? candidate.originalPath : null
    )
    const entry: OpenEntry = {
      session,
      filePath: keepAssociation ? candidate.originalPath : null,
      assets: indexAssets(project)
    }
    this.open.set(sessionId, entry)
    this.recovery = {
      ...this.recovery,
      candidates: this.recovery.candidates.filter((c) => c.sessionId !== sessionId)
    }
    const warnings: string[] = []
    if (candidate.conflict === 'portable-changed') {
      warnings.push(
        'The saved file changed after this recovery copy was made. Use Save As to keep both versions.'
      )
    } else if (candidate.conflict === 'portable-missing') {
      warnings.push(
        'The original saved file is no longer there. Use Save As to save this project again.'
      )
    }
    return this.info(entry, project, true, warnings)
  }

  /** Permanently removes a recovery copy. Never touches any portable project file. */
  async discardRecovery(sessionId: string): Promise<void> {
    if (!this.recovery.candidates.some((c) => c.sessionId === sessionId)) {
      throw new PersistenceError('session-not-found', 'That recovery copy is no longer available.')
    }
    try {
      await removeSession(this.options.sessionsRoot, sessionId)
    } catch (e) {
      throw new PersistenceError(
        'recovery-discard-failed',
        'The recovery copy could not be removed.',
        String(e),
        e
      )
    }
    this.recovery = {
      ...this.recovery,
      candidates: this.recovery.candidates.filter((c) => c.sessionId !== sessionId)
    }
  }
}
