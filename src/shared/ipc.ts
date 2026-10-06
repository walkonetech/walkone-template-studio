/** IPC contract shared by main, preload and renderer. Keep payloads plain, serializable data. */
import type { PrintPresetId, TemplateProject } from '../domain'
import type { IpcResult } from './persistence'

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
  ProjectRecents: 'project:recents'
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
  }
}
