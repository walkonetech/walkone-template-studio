import type { TemplateProject } from '@domain'
import type { OpenProjectInfo, NewProjectRequest, RecentProjectItem } from '@shared/ipc'
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
}
