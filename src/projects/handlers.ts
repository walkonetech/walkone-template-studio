import { z } from 'zod'
import { createProject, IdSchema, PRINT_PRESET_IDS, type TemplateProject } from '../domain'
import { createSampleTemplate } from './sampleProject'
import type { IpcResult } from '../shared/persistence'
import type {
  RecoveryOverview,
  AssetData,
  NewProjectRequest,
  OpenProjectInfo,
  OpenRecentRequest,
  RecentProjectItem,
  SessionProjectRequest,
  SessionRequest,
  WorkingCopyResult
} from '../shared/ipc'
import { PROJECT_EXTENSION } from './constants'
import { PersistenceError, toSafeError } from './errors'
import type { RecentProjectsStore } from './recents'
import type { ProjectService } from './service'

/** Native dialogs, supplied by the main process. `ctx` is opaque (e.g., the parent window). */
export interface ProjectDialogs {
  /** Resolves to the chosen path, or null if the user cancelled. */
  showOpen(ctx: unknown): Promise<string | null>
  showSave(ctx: unknown, suggestedName: string): Promise<string | null>
}

export interface HandlerDeps {
  service: ProjectService
  recents: RecentProjectsStore
  dialogs: ProjectDialogs
  /** Receives internal error detail for logging; never sent to the renderer. */
  log?: (message: string, detail?: unknown) => void
}

const NewSchema = z.strictObject({
  name: z.string().min(1).max(200),
  preset: z.enum(PRINT_PRESET_IDS)
})
const SessionSchema = z.strictObject({ sessionId: IdSchema })
const AssetRequestSchema = z.strictObject({ sessionId: IdSchema, assetId: IdSchema })
const OpenRecentSchema = z.strictObject({ path: z.string().min(1).max(4096) })
// The project itself is fully validated by the domain loader inside the service.
const SessionProjectSchema = z.strictObject({ sessionId: IdSchema, project: z.unknown() })

function ensureExtension(path: string): string {
  return path.toLowerCase().endsWith(PROJECT_EXTENSION) ? path : path + PROJECT_EXTENSION
}

function safeFileStem(name: string): string {
  return name.replace(/[^\w\- .]+/g, '').trim() || 'Untitled'
}

export function createProjectHandlers(deps: HandlerDeps) {
  const { service, recents, dialogs } = deps

  async function run<T>(op: () => Promise<IpcResult<T>>): Promise<IpcResult<T>> {
    try {
      return await op()
    } catch (e) {
      deps.log?.(
        'project operation failed',
        e instanceof PersistenceError ? (e.detail ?? e.message) : e
      )
      return { status: 'error', error: toSafeError(e) }
    }
  }

  function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
    const r = schema.safeParse(payload)
    if (!r.success)
      throw new PersistenceError('invalid-request', 'The request was not valid.', r.error.message)
    return r.data
  }

  const ok = <T>(value: T): IpcResult<T> => ({ status: 'ok', value })

  async function saveAsFlow(
    ctx: unknown,
    sessionId: string,
    project: unknown
  ): Promise<IpcResult<OpenProjectInfo>> {
    const typed = project as TemplateProject
    const chosen = await dialogs.showSave(
      ctx,
      `${safeFileStem(typed?.metadata?.name ?? 'Untitled')}${PROJECT_EXTENSION}`
    )
    if (chosen === null) return { status: 'cancelled' }
    return ok(await service.saveAs(sessionId, typed, ensureExtension(chosen)))
  }

  return {
    newProject: (payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req: NewProjectRequest = parse(NewSchema, payload)
        return ok(await service.createNew(createProject({ name: req.name, design: req.preset })))
      }),

    /** Development diagnostic only: a realistic 4x6 @600 DPI sample project with one real asset. */
    newSampleProject: (): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const { project, assets } = createSampleTemplate()
        return ok(await service.createNew(project, assets))
      }),

    /** Startup recovery candidates (no file-system paths). */
    recoveryList: (): Promise<IpcResult<RecoveryOverview>> =>
      run(async () =>
        ok({
          candidates: service.listRecovery().map((c) => ({
            sessionId: c.sessionId,
            projectName: c.projectName,
            originalFileName: c.originalFileName,
            neverSaved: c.neverSaved,
            lastWorkingSaveAt: c.lastWorkingSaveAt,
            lastPortableSaveAt: c.lastPortableSaveAt,
            conflict: c.conflict,
            missingAssets: c.missingAssets
          })),
          quarantined: service.lastScan().quarantined.length
        })
      ),

    recoveryRecover: (payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req: SessionRequest = parse(SessionSchema, payload)
        return ok(await service.recover(req.sessionId))
      }),

    recoveryDiscard: (payload: unknown): Promise<IpcResult<null>> =>
      run(async () => {
        const req: SessionRequest = parse(SessionSchema, payload)
        await service.discardRecovery(req.sessionId)
        return ok(null)
      }),

    /** Reads a project-owned asset's bytes for the renderer (by session + asset id, never by path). */
    readAsset: (payload: unknown): Promise<IpcResult<AssetData>> =>
      run(async () => {
        const req = parse(AssetRequestSchema, payload)
        return ok(await service.readAsset(req.sessionId, req.assetId))
      }),

    open: (ctx: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const chosen = await dialogs.showOpen(ctx)
        if (chosen === null) return { status: 'cancelled' }
        return ok(await service.openFile(chosen))
      }),

    openRecent: (payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req: OpenRecentRequest = parse(OpenRecentSchema, payload)
        if (!(await recents.has(req.path))) {
          throw new PersistenceError('not-allowed', 'That project is not in the recent list.')
        }
        try {
          return ok(await service.openFile(req.path))
        } catch (e) {
          if (e instanceof PersistenceError && e.code === 'file-not-found')
            await recents.remove(req.path)
          throw e
        }
      }),

    save: (ctx: unknown, payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req = parse(SessionProjectSchema, payload)
        if (!service.hasSavedFile(req.sessionId)) return saveAsFlow(ctx, req.sessionId, req.project)
        return ok(await service.save(req.sessionId, req.project as TemplateProject))
      }),

    saveAs: (ctx: unknown, payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req = parse(SessionProjectSchema, payload)
        return saveAsFlow(ctx, req.sessionId, req.project)
      }),

    updateWorkingCopy: (payload: unknown): Promise<IpcResult<WorkingCopyResult>> =>
      run(async () => {
        const req: SessionProjectRequest = parse(
          SessionProjectSchema,
          payload
        ) as SessionProjectRequest
        return ok(await service.updateWorkingCopy(req.sessionId, req.project))
      }),

    close: (payload: unknown): Promise<IpcResult<null>> =>
      run(async () => {
        const req: SessionRequest = parse(SessionSchema, payload)
        await service.close(req.sessionId)
        return ok(null)
      }),

    recents: (): Promise<IpcResult<RecentProjectItem[]>> =>
      run(async () =>
        ok(
          (await recents.list()).map(({ path, name, lastOpenedAt, exists }) => ({
            path,
            name,
            lastOpenedAt,
            exists
          }))
        )
      )
  }
}
export type ProjectHandlers = ReturnType<typeof createProjectHandlers>
