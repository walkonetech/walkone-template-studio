import { basename } from 'node:path'
import { loadProject, serializeProject, type TemplateProject } from '../domain'
import { defaultFsOps, type FsOps } from './atomicFile'
import { PersistenceError, fromFsError } from './errors'
import { openPackage } from './packageReader'
import { verifySessionAssets, writePackage } from './packageWriter'
import type { RecentProjectsStore } from './recents'
import {
  createWorkingSession,
  hashText,
  listSessions,
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
}

export interface ProjectServiceOptions {
  sessionsRoot: string
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

  constructor(private readonly options: ProjectServiceOptions) {
    this.fsOps = options.fsOps ?? defaultFsOps
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
      initialAssets
    })
    const entry: OpenEntry = { session, filePath: null }
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
        lastPortableSaveAt: new Date().toISOString()
      })
      await pkg.extractAssets(session.dir)
      const entry: OpenEntry = { session, filePath: path }
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
    return saveWorkingSession(this.entry(sessionId).session, project)
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
    await markPortableSaved(e.session, project, destPath)
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
   * For app shutdown: deletes sessions that are clean and keeps ones with unsaved changes on
   * disk so a future recovery feature can offer them.
   */
  async shutdown(): Promise<void> {
    const { sessions } = await listSessions(this.options.sessionsRoot)
    for (const s of sessions) {
      if (this.open.has(s.id) && !s.meta.hasUnsavedChanges)
        await removeSession(this.options.sessionsRoot, s.id)
    }
    this.open.clear()
  }
}
