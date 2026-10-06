import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { createProjectHandlers } from '../projects/handlers'
import { RecentProjectsStore } from '../projects/recents'
import { ProjectService } from '../projects/service'
import { PROJECT_EXTENSION } from '../projects/constants'
import type { ProjectDialogs } from '../projects/handlers'

const FILTERS = [
  { name: 'WalkOne Template Studio Project', extensions: [PROJECT_EXTENSION.slice(1)] }
]

/**
 * Native dialogs. In development builds only (never when packaged), WALKONE_DEV_OPEN_PATH /
 * WALKONE_DEV_SAVE_PATH let automated manual-validation scripts answer the dialogs.
 */
function createDialogs(): ProjectDialogs {
  const devOverride = (name: string): string | undefined =>
    app.isPackaged ? undefined : process.env[name]
  const windowOf = (ctx: unknown): BrowserWindow | undefined =>
    ctx instanceof BrowserWindow ? ctx : undefined
  return {
    async showOpen(ctx) {
      const override = devOverride('WALKONE_DEV_OPEN_PATH')
      if (override) return override
      const options = { title: 'Open Project', properties: ['openFile' as const], filters: FILTERS }
      const win = windowOf(ctx)
      const r = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return r.canceled || r.filePaths.length === 0 ? null : (r.filePaths[0] ?? null)
    },
    async showSave(ctx, suggestedName) {
      const override = devOverride('WALKONE_DEV_SAVE_PATH')
      if (override) return override
      const options = { title: 'Save Project', defaultPath: suggestedName, filters: FILTERS }
      const win = windowOf(ctx)
      const r = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      return r.canceled || !r.filePath ? null : r.filePath
    }
  }
}

export function registerProjectIpc(
  isTrustedSender: (e: IpcMainInvokeEvent) => boolean
): ProjectService {
  const userData = app.getPath('userData')
  const recents = new RecentProjectsStore(join(userData, 'recent-projects.json'))
  const service = new ProjectService({ sessionsRoot: join(userData, 'sessions'), recents })
  const handlers = createProjectHandlers({
    service,
    recents,
    dialogs: createDialogs(),
    log: (message, detail) => console.error(`[project] ${message}`, detail)
  })

  const guard =
    <A extends unknown[], R>(fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R>) =>
    (event: IpcMainInvokeEvent, ...args: A): Promise<R> => {
      if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
      return fn(event, ...args)
    }
  const win = (e: IpcMainInvokeEvent): BrowserWindow | null =>
    BrowserWindow.fromWebContents(e.sender)

  ipcMain.handle(
    IpcChannel.ProjectNew,
    guard((_e, p: unknown) => handlers.newProject(p))
  )
  ipcMain.handle(
    IpcChannel.ProjectNewSample,
    guard(() => handlers.newSampleProject())
  )
  ipcMain.handle(
    IpcChannel.ProjectOpen,
    guard((e) => handlers.open(win(e)))
  )
  ipcMain.handle(
    IpcChannel.ProjectOpenRecent,
    guard((_e, p: unknown) => handlers.openRecent(p))
  )
  ipcMain.handle(
    IpcChannel.ProjectSave,
    guard((e, p: unknown) => handlers.save(win(e), p))
  )
  ipcMain.handle(
    IpcChannel.ProjectSaveAs,
    guard((e, p: unknown) => handlers.saveAs(win(e), p))
  )
  ipcMain.handle(
    IpcChannel.ProjectUpdateWorkingCopy,
    guard((_e, p: unknown) => handlers.updateWorkingCopy(p))
  )
  ipcMain.handle(
    IpcChannel.ProjectClose,
    guard((_e, p: unknown) => handlers.close(p))
  )
  ipcMain.handle(
    IpcChannel.ProjectRecents,
    guard(() => handlers.recents())
  )
  return service
}
