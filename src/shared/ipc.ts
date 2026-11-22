/** IPC contract shared by main, preload and renderer. Keep payloads plain, serializable data. */
import type { AssetReference, PrintPresetId, TemplateProject } from '../domain'
import type { IpcResult, SafeError } from './persistence'

export const IpcChannel = {
  AppPing: 'app:ping',
  /**
   * Appearance (B2, ADR-055): tells main the chosen theme so native chrome (Windows title bar, macOS menus and dialogs)
   * follows it. A per-computer preference; nothing about the project crosses.
   */
  AppSetNativeTheme: 'app:setNativeTheme',
  ProjectNew: 'project:new',
  /** Development diagnostic: a new project containing one tiny sample asset. */
  ProjectNewSample: 'project:newSample',
  ProjectOpen: 'project:open',
  ProjectOpenRecent: 'project:openRecent',
  ProjectLocateRecent: 'project:locateRecent',
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
  /** Native picker for ONE preview photo; returns its bytes only (never stored in the project, no path crosses IPC). */
  /** DSLR Booth importer: main shows the ZIP picker and returns the analysis (an opaque token, never a path). */
  DslrImportChoose: 'dslrImport:choose',
  /** Creates the project from an analysed ZIP (by token) in the chosen layout. */
  DslrImportCommit: 'dslrImport:commit',
  /** Export (Phase 6A): main shows the folder picker and returns an opaque destination id (no path crosses IPC). */
  ExportChooseDestination: 'export:chooseDestination',
  /** Writes rendered outputs (PNG bytes / package entries) into a chosen destination. */
  ExportWrite: 'export:write',
  /** Reveals a file this app exported, in Finder / Explorer. */
  ExportReveal: 'export:reveal',
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
  /** The design's print size in inches, when known (entries from before Phase 7B B3 do not have it). */
  print?: { width: number; height: number; dpi: number }
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
// ------------------------------------------------------------------------------------------- DSLR Booth importer

/** 'strip' = one 2×6 strip printed two-up (the second strip on the sheet was a copy); 'as-is' = the sheet unchanged. */
export type DslrImportLayout = 'as-is' | 'strip'
export interface DslrImportCheck {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}
export interface DslrImportPreview {
  /** Opaque handle for the analysed file (main keeps the path). */
  token: string
  fileName: string
  templateName: string
  widthPx: number
  heightPx: number
  dpi: number
  widthIn: number
  heightIn: number
  photoSlots: number
  photoCount: number
  images: number
  /** Present when the sheet holds two matching strips side by side. */
  twoUp: {
    stripWidthIn: number
    stripHeightIn: number
    differences: string[]
    crossing: number
  } | null
  recommendedLayout: DslrImportLayout
  /** Import notes per layout ('strip' only when `twoUp`). */
  checks: Partial<Record<DslrImportLayout, DslrImportCheck[]>>
  /** dslrBooth's own preview from the ZIP (not imported), for comparison. */
  preview: { data: Uint8Array; width: number; height: number } | null
}
export interface DslrImportCommitRequest {
  token: string
  layout: DslrImportLayout
}

// ------------------------------------------------------------------------------------------------ export (6A)

/** A chosen export folder, known to the renderer only by an opaque id and a display name. */
export interface ExportDestination {
  destinationId: string
  /** Last path component of the folder, for display only. */
  folderName: string
}
/** Expected raster facts the main process verifies against the PNG header before writing. */
export interface ExportPngFacts {
  width: number
  height: number
  /** Recorded in the PNG pHYs chunk. */
  dpi: number
}
export interface ExportPngFile extends ExportPngFacts {
  kind: 'png'
  /** A single safe file name (see `isSafeExportFileName`); never a path. */
  name: string
  data: Uint8Array
}
export interface ExportPackageEntry {
  /** Flat entry name inside the package (`isSafePackageEntryPath`, or `isSafeDslrEntryPath` for dslrBooth). */
  path: string
  data: Uint8Array
  /** Present for PNG entries: verified, and the density is recorded. */
  png?: ExportPngFacts
}
export interface ExportZipFile {
  kind: 'zip'
  /** 'layers' = the vendor-neutral layer package (6A); 'dslrbooth' = a dslrBooth 7.48 template (6B). */
  format: 'layers' | 'dslrbooth'
  name: string
  entries: ExportPackageEntry[]
}
export type ExportFile = ExportPngFile | ExportZipFile
/** What to do when a file of the same name already exists in the destination. */
export type ExportConflictPolicy = 'ask' | 'replace' | 'keep-both'
export interface ExportWriteRequest {
  destinationId: string
  files: ExportFile[]
  onConflict: ExportConflictPolicy
}
export interface ExportWrittenFile {
  /** The name the renderer asked for. */
  requested: string
  /** The name actually written ("Name (2).png" when keeping both). */
  name: string
  bytes: number
}
export type ExportWriteResult =
  /** Nothing was written: these names already exist and the policy was 'ask'. */
  | { outcome: 'conflict'; existing: string[] }
  | {
      outcome: 'written'
      folderName: string
      written: ExportWrittenFile[]
      failed: { name: string; error: SafeError }[]
    }
export interface ExportRevealRequest {
  destinationId: string
  name: string
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
export type NativeThemeSource = 'light' | 'dark' | 'system'

export interface RendererApi {
  ping(): Promise<PingResult>
  appearance: {
    /** Native chrome follows the app theme; resolves to the theme the OS chrome now uses. */
    setNativeTheme(req: { source: NativeThemeSource }): Promise<'light' | 'dark'>
  }
  project: {
    create(req: NewProjectRequest): Promise<IpcResult<OpenProjectInfo>>
    newSample(): Promise<IpcResult<OpenProjectInfo>>
    /** Shows the native Open dialog. */
    open(): Promise<IpcResult<OpenProjectInfo>>
    /** Opens a project from the recent list (the path must be in that list). */
    openRecent(req: OpenRecentRequest): Promise<IpcResult<OpenProjectInfo>>
    /** Locate… on a missing recent card: choose the moved file; that card is reconnected to it (cancel: no change). */
    locateRecent(req: OpenRecentRequest): Promise<IpcResult<OpenProjectInfo>>
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
  dslrImport: {
    /** Shows the native ZIP picker and analyses the chosen dslrBooth template (nothing is created yet). */
    choose(): Promise<IpcResult<DslrImportPreview>>
    /** Creates a new, unsaved project from the analysed template. */
    commit(req: DslrImportCommitRequest): Promise<IpcResult<OpenProjectInfo>>
  }
  export: {
    /** Shows the native folder picker (main-owned); `cancelled` when dismissed. */
    chooseDestination(): Promise<IpcResult<ExportDestination>>
    /** Verifies and writes the outputs atomically; reports conflicts first when asked to. */
    write(req: ExportWriteRequest): Promise<IpcResult<ExportWriteResult>>
    /** Shows an exported file in Finder / Explorer (only files this destination wrote). */
    reveal(req: ExportRevealRequest): Promise<IpcResult<null>>
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
