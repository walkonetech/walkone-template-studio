/** IPC contract shared by main, preload and renderer. Keep payloads plain, serializable data. */
import type { AssetReference, PrintPresetId, TemplateProject } from '../domain'
import type { IpcResult, SafeError } from './persistence'

export const IpcChannel = {
  AppPing: 'app:ping',
  ProjectNew: 'project:new',
  /** Development diagnostic: a new project containing one tiny sample asset. */
  ProjectNewSample: 'project:newSample',
  ProjectOpen: 'project:open',
  ProjectOpenRecent: 'project:openRecent',
  ProjectSave: 'project:save',
  ProjectSaveAs: 'project:saveAs',
  ProjectUpdateWorkingCopy: 'project:updateWorkingCopy',
  ProjectClose: 'project:close',
  ProjectRecents: 'project:recents',
  /** Reads a project-owned asset by session + asset id (never by path). */
  ProjectReadAsset: 'project:readAsset',
  /** Native "choose images" dialog (main shows it), then imports the chosen files into the session. */
  ProjectImportAssets: 'project:importAssets',
  /** Imports image bytes the renderer already holds (drag and drop); no path ever crosses IPC. */
  ProjectImportAssetData: 'project:importAssetData',
  /** Startup recovery: list candidates, restore one into the editor, or discard one. */
  RecoveryList: 'recovery:list',
  RecoveryRecover: 'recovery:recover',
  RecoveryDiscard: 'recovery:discard',
  /** Renderer asks main whether the open document may be closed/replaced (shows the unsaved-changes prompt). */
  DocumentRequestClose: 'document:requestClose',
  /** Main asks the renderer for its document state or to save; the renderer answers on DocumentResponse. */
  DocumentRequest: 'document:request',
  DocumentResponse: 'document:response'
} as const

export interface PingResult {
  ok: true
  appVersion: string
  platform: string
  electronVersion: string
}

/** What the renderer may know about an open project. Internal session paths are never exposed. */
export interface OpenProjectInfo {
  sessionId: string
  project: TemplateProject
  /** File name of the saved package, or null if never saved. */
  fileName: string | null
  /** True when there are changes not yet written by a successful Save/Save As. */
  dirty: boolean
  warnings: string[]
}

export interface NewProjectRequest {
  name: string
  preset: PrintPresetId
}
export interface SessionProjectRequest {
  sessionId: string
  project: TemplateProject
}
export interface SessionRequest {
  sessionId: string
}
export interface OpenRecentRequest {
  path: string
}
export interface SavedAs {
  info: OpenProjectInfo
}
export interface RecentProjectItem {
  path: string
  name: string
  lastOpenedAt: string
  exists: boolean
}
export interface AssetRequest {
  sessionId: string
  assetId: string
}
export interface AssetData {
  mediaType: string
  data: Uint8Array
}
/** Max files accepted in one import request. */
export const MAX_IMPORT_FILES = 50
export interface ImportAssetsRequest {
  sessionId: string
  /** Allow choosing several files in the dialog (default true). */
  multiple?: boolean
}
export interface ImportAssetDataRequest {
  sessionId: string
  files: { name: string; data: Uint8Array }[]
}
export interface ImportedAsset {
  /** The project-owned asset (new, or the existing one when identical content was imported before). */
  asset: AssetReference
  /** True when identical content was already in the project and that asset was reused. */
  deduplicated: boolean
}
export interface ImportFailure {
  /** Display name of the file that failed (never a full path). */
  filename: string
  error: SafeError
}
export interface ImportAssetsResult {
  imported: ImportedAsset[]
  failures: ImportFailure[]
}
export type CloseReason = 'window-close' | 'quit' | 'close-project' | 'replace'

/** Facts the main process needs to guard close/quit. */
export interface DocumentState {
  hasProject: boolean
  /** Modified: there are changes not written by an explicit Save / Save As. */
  dirty: boolean
  name: string | null
  /** Never saved to a .boothproject (Save would need Save As). */
  neverSaved: boolean
}
export type DocumentRequestKind = 'state' | 'save'
export type DocumentResult =
  | { kind: 'state'; state: DocumentState }
  | { kind: 'save'; status: 'saved' | 'cancelled' | 'failed'; message?: string }
export type DocumentHandler = (kind: DocumentRequestKind) => Promise<DocumentResult>
export interface DocumentRequestMessage {
  id: number
  kind: DocumentRequestKind
}
export interface DocumentResponseMessage {
  id: number
  result: DocumentResult
}
export interface CloseDecision {
  proceed: boolean
}

export type RecoveryConflictKind = 'none' | 'portable-changed' | 'portable-missing'
export interface RecoveryCandidateInfo {
  sessionId: string
  projectName: string
  originalFileName: string | null
  neverSaved: boolean
  lastWorkingSaveAt: string
  lastPortableSaveAt: string | null
  conflict: RecoveryConflictKind
  missingAssets: number
}
export interface RecoveryOverview {
  candidates: RecoveryCandidateInfo[]
  /** Unusable sessions set aside at startup. */
  quarantined: number
}
export interface WorkingCopyResult {
  dirty: boolean
}

/** The only API the renderer can reach; exposed on `window.api` by the preload script. */
export interface RendererApi {
  ping(): Promise<PingResult>
  project: {
    create(req: NewProjectRequest): Promise<IpcResult<OpenProjectInfo>>
    newSample(): Promise<IpcResult<OpenProjectInfo>>
    /** Shows the native Open dialog. */
    open(): Promise<IpcResult<OpenProjectInfo>>
    /** Opens a project from the recent list (the path must be in that list). */
    openRecent(req: OpenRecentRequest): Promise<IpcResult<OpenProjectInfo>>
    /** Saves to the existing file, or shows the Save dialog if the project was never saved. */
    save(req: SessionProjectRequest): Promise<IpcResult<OpenProjectInfo>>
    /** Always shows the native Save dialog. */
    saveAs(req: SessionProjectRequest): Promise<IpcResult<OpenProjectInfo>>
    /** Writes the working copy (autosave foundation); does not mark the project saved. */
    updateWorkingCopy(req: SessionProjectRequest): Promise<IpcResult<WorkingCopyResult>>
    close(req: SessionRequest): Promise<IpcResult<null>>
    recents(): Promise<IpcResult<RecentProjectItem[]>>
    /** Bytes of a project asset from the working session (the only way the renderer reads project images). */
    readAsset(req: AssetRequest): Promise<IpcResult<AssetData>>
    /** Shows the native image picker, copies the chosen files into the project, returns the new assets. */
    importAssets(req: ImportAssetsRequest): Promise<IpcResult<ImportAssetsResult>>
    /** Imports dropped files from their bytes (the renderer never supplies a filesystem path). */
    importAssetData(req: ImportAssetDataRequest): Promise<IpcResult<ImportAssetsResult>>
  }
  recovery: {
    list(): Promise<IpcResult<RecoveryOverview>>
    /** Restores a recovery copy into the editor as a Modified project (never overwrites the portable file). */
    recover(req: SessionRequest): Promise<IpcResult<OpenProjectInfo>>
    discard(req: SessionRequest): Promise<IpcResult<null>>
  }
  document: {
    /** Asks main whether the document may be closed/replaced; main shows the Save / Don't Save / Cancel prompt. */
    requestClose(req: { reason: CloseReason }): Promise<IpcResult<CloseDecision>>
    /** The renderer's single responder to main's requests (state, save). */
    setHandler(handler: DocumentHandler): void
  }
}
