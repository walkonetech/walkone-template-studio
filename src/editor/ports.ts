import type { TemplateProject } from '@domain'
import type {
  CloseReason,
  ImportAssetsResult,
  NewProjectRequest,
  OpenProjectInfo,
  RecentProjectItem,
  RecoveryOverview
} from '@shared/ipc'
import type { IpcResult } from '@shared/persistence'

/**
 * What the editor store needs from the outside world (the Electron main process via preload). Injected,
 * so the store is testable without Electron and never touches the filesystem itself.
 */
export interface EditorPorts {
  create(req: NewProjectRequest): Promise<IpcResult<OpenProjectInfo>>
  newSample(): Promise<IpcResult<OpenProjectInfo>>
  open(): Promise<IpcResult<OpenProjectInfo>>
  openRecent(path: string): Promise<IpcResult<OpenProjectInfo>>
  save(sessionId: string, project: TemplateProject): Promise<IpcResult<OpenProjectInfo>>
  saveAs(sessionId: string, project: TemplateProject): Promise<IpcResult<OpenProjectInfo>>
  /** Writes the working-session manifest only (never rebuilds the .boothproject). */
  updateWorkingCopy(
    sessionId: string,
    project: TemplateProject
  ): Promise<IpcResult<{ dirty: boolean }>>
  close(sessionId: string): Promise<IpcResult<null>>
  recents(): Promise<IpcResult<RecentProjectItem[]>>
  /** Native image picker + import into the session (main shows the dialog). */
  importAssets(sessionId: string, multiple: boolean): Promise<IpcResult<ImportAssetsResult>>
  /** Imports dropped files from their bytes. */
  importAssetData(
    sessionId: string,
    files: { name: string; data: Uint8Array }[]
  ): Promise<IpcResult<ImportAssetsResult>>
  /** Asks the main process whether the document may be closed/replaced (it shows the unsaved-changes prompt). */
  requestClose(reason: CloseReason): Promise<IpcResult<{ proceed: boolean }>>
  recoveryList(): Promise<IpcResult<RecoveryOverview>>
  recover(sessionId: string): Promise<IpcResult<OpenProjectInfo>>
  discardRecovery(sessionId: string): Promise<IpcResult<null>>
}
