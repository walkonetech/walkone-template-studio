import { z } from 'zod'
import { createProject, IdSchema, PRINT_PRESET_IDS, type TemplateProject } from '../domain'
import { createSampleTemplate } from './sampleProject'
import type { IpcResult } from '../shared/persistence'
import { MAX_IMPORT_FILES } from '../shared/ipc'
import { randomBytes } from 'node:crypto'
import { analyzeDslrPackage } from './dslrImport'
import { exportFileStem } from '../export/naming'
import type {
  DslrImportCommitRequest,
  DslrImportLayout,
  DslrImportPreview,
  RecoveryOverview,
  AssetData,
  ImportAssetDataRequest,
  ImportAssetsRequest,
  ImportAssetsResult,
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
  /** Resolves to the chosen image file paths, or null if the user cancelled. */
  showImportImages(ctx: unknown, multiple: boolean): Promise<string[] | null>
  /** Resolves to the chosen dslrBooth template ZIP, or null if the user cancelled. */
  showImportDslr?(ctx: unknown): Promise<string | null>
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
const ImportDialogSchema = z.strictObject({ sessionId: IdSchema, multiple: z.boolean().optional() })
const ImportDataSchema = z.strictObject({
  sessionId: IdSchema,
  files: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(1024),
        data: z.instanceof(Uint8Array)
      })
    )
    .min(1)
    .max(MAX_IMPORT_FILES)
})
const DslrCommitSchema = z.strictObject({
  token: z.string().regex(/^[0-9a-f]{32}$/),
  layout: z.enum(['as-is', 'strip'])
})
/** Analysed-but-not-imported ZIPs, by token (main keeps the path; the renderer only ever sees the token). */
const MAX_PENDING_DSLR = 8
const OpenRecentSchema = z.strictObject({ path: z.string().min(1).max(4096) })
// The project itself is fully validated by the domain loader inside the service.
const SessionProjectSchema = z.strictObject({ sessionId: IdSchema, project: z.unknown() })

function ensureExtension(path: string): string {
  return path.toLowerCase().endsWith(PROJECT_EXTENSION) ? path : path + PROJECT_EXTENSION
}

export function createProjectHandlers(deps: HandlerDeps) {
  const { service, recents, dialogs } = deps
  const pendingDslr = new Map<string, string>()

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
      `${exportFileStem(typed?.metadata?.name ?? 'Untitled')}${PROJECT_EXTENSION}`
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

    /** Native picker → import. Cancelling the dialog is a normal outcome, not an error. */
    importAssets: (ctx: unknown, payload: unknown): Promise<IpcResult<ImportAssetsResult>> =>
      run(async () => {
        const req = parse(ImportDialogSchema, payload) as ImportAssetsRequest
        const chosen = await dialogs.showImportImages(ctx, req.multiple ?? true)
        if (chosen === null || chosen.length === 0) return { status: 'cancelled' }
        return ok(await service.importAssetFiles(req.sessionId, chosen.slice(0, MAX_IMPORT_FILES)))
      }),

    importAssetData: (payload: unknown): Promise<IpcResult<ImportAssetsResult>> =>
      run(async () => {
        const req: ImportAssetDataRequest = parse(ImportDataSchema, payload)
        return ok(await service.importAssetBytes(req.sessionId, req.files))
      }),

    /** DSLR Booth importer, step 1: pick a ZIP and analyse it. Nothing is created yet. */
    dslrImportChoose: (ctx: unknown): Promise<IpcResult<DslrImportPreview>> =>
      run(async () => {
        const chosen = dialogs.showImportDslr ? await dialogs.showImportDslr(ctx) : null
        if (chosen === null) return { status: 'cancelled' }
        const main = await analyzeDslrPackage(chosen)
        const checks: DslrImportPreview['checks'] = { [main.result.layout]: main.result.items }
        const other: DslrImportLayout = main.result.layout === 'strip' ? 'as-is' : 'strip'
        if (main.result.twoUp)
          checks[other] = (await analyzeDslrPackage(chosen, other)).result.items
        const token = randomBytes(16).toString('hex')
        pendingDslr.set(token, chosen)
        while (pendingDslr.size > MAX_PENDING_DSLR) {
          const oldest = pendingDslr.keys().next().value
          if (oldest === undefined) break
          pendingDslr.delete(oldest)
        }
        const s = main.result.summary
        return ok({
          token,
          fileName: s.fileName,
          templateName: s.templateName,
          widthPx: s.widthPx,
          heightPx: s.heightPx,
          dpi: s.dpi,
          widthIn: s.widthIn,
          heightIn: s.heightIn,
          photoSlots: s.photoSlots,
          photoCount: s.photoCount,
          images: s.images,
          twoUp: main.result.twoUp,
          recommendedLayout: main.result.recommendedLayout,
          checks,
          preview: main.preview
        })
      }),

    /** DSLR Booth importer, step 2: create a new, unsaved project from the analysed ZIP. */
    dslrImportCommit: (payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req: DslrImportCommitRequest = parse(DslrCommitSchema, payload)
        const path = pendingDslr.get(req.token)
        if (path === undefined)
          throw new PersistenceError('not-allowed', 'Choose the dslrBooth template again.')
        const { result, initialAssets } = await analyzeDslrPackage(path, req.layout)
        const info = await service.createNew(result.project, initialAssets, [
          `Imported “${result.summary.fileName}” from dslrBooth. Save it to keep it as a Template Studio project.`
        ])
        pendingDslr.delete(req.token)
        return ok(info)
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

    /**
     * Locate… on a missing recent card (B5.1): the user finds the moved file, it opens, and that card is reconnected
     * to the new place instead of a second card appearing. Cancel changes nothing.
     */
    locateRecent: (ctx: unknown, payload: unknown): Promise<IpcResult<OpenProjectInfo>> =>
      run(async () => {
        const req: OpenRecentRequest = parse(OpenRecentSchema, payload)
        if (!(await recents.has(req.path))) {
          throw new PersistenceError('not-allowed', 'That project is not in the recent list.')
        }
        const chosen = await dialogs.showOpen(ctx)
        if (chosen === null) return { status: 'cancelled' }
        return ok(await service.openFile(chosen, { replacingRecent: req.path }))
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
          (await recents.list()).map(({ path, name, lastOpenedAt, exists, print }) => ({
            path,
            name,
            lastOpenedAt,
            exists,
            ...(print
              ? { print: { width: print.width, height: print.height, dpi: print.dpi } }
              : {})
          }))
        )
      )
  }
}
export type ProjectHandlers = ReturnType<typeof createProjectHandlers>
