import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IpcChannel } from '../shared/ipc'
import { createProjectHandlers } from '../projects/handlers'
import { RecentProjectsStore } from '../projects/recents'
import { ProjectService } from '../projects/service'
import { PROJECT_EXTENSION } from '../projects/constants'
import { devValue } from './devOverrides'
import type { ProjectDialogs } from '../projects/handlers'

const FILTERS = [
  { name: 'WalkOne Template Studio Project', extensions: [PROJECT_EXTENSION.slice(1)] }
]

/**
 * Native dialogs. In development builds only (never when packaged), WALKONE_DEV_OPEN_PATH / WALKONE_DEV_SAVE_PATH let
 * automated validation scripts answer the dialogs ("CANCEL" simulates cancelling; ';' separates a sequence).
 */
function createDialogs(): ProjectDialogs {
  const windowOf = (ctx: unknown): BrowserWindow | undefined =>
    ctx instanceof BrowserWindow ? ctx : undefined
  return {
    async showOpen(ctx) {
      const override = devValue('WALKONE_DEV_OPEN_PATH')
      if (override) return override === 'CANCEL' ? null : override
      const options = { title: 'Open Project', properties: ['openFile' as const], filters: FILTERS }
      const win = windowOf(ctx)
      const r = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return r.canceled || r.filePaths.length === 0 ? null : (r.filePaths[0] ?? null)
    },
    async showImportImages(ctx, multiple) {
      const override = devValue('WALKONE_DEV_IMPORT_PATHS')
      // Dev-only: '|' separates files within one answer, ';' separates successive dialogs; CANCEL cancels.
      if (override) return override === 'CANCEL' ? null : override.split('|').filter(Boolean)
      const options = {
        title: 'Import Images',
        properties: multiple
          ? ['openFile' as const, 'multiSelections' as const]
          : ['openFile' as const],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
      }
      const win = windowOf(ctx)
      const r = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths
    },
    async showSave(ctx, suggestedName) {
      const override = devValue('WALKONE_DEV_SAVE_PATH')
      if (override) return override === 'CANCEL' ? null : override
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
  const service = new ProjectService({
    sessionsRoot: join(userData, 'sessions'),
    quarantineRoot: join(userData, 'session-quarantine'),
    recents
  })
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
  ipcMain.handle(
    IpcChannel.ProjectReadAsset,
    guard((_e, p: unknown) => handlers.readAsset(p))
  )
  ipcMain.handle(
    IpcChannel.ProjectImportAssets,
    guard((e, p: unknown) => handlers.importAssets(win(e), p))
  )
  ipcMain.handle(
    IpcChannel.ProjectImportAssetData,
    guard((_e, p: unknown) => handlers.importAssetData(p))
  )
  ipcMain.handle(
    IpcChannel.RecoveryList,
    guard(() => handlers.recoveryList())
  )
  ipcMain.handle(
    IpcChannel.RecoveryRecover,
    guard((_e, p: unknown) => handlers.recoveryRecover(p))
  )
  ipcMain.handle(
    IpcChannel.RecoveryDiscard,
    guard((_e, p: unknown) => handlers.recoveryDiscard(p))
  )
  return service
}
