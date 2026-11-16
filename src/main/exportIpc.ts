import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IpcChannel } from '../shared/ipc'
import { ExportService } from './exportService'
import { devValue } from './devOverrides'

/**
 * Registers the export IPC (Phase 6A). The folder picker is main-owned. In development builds only (never when
 * packaged) WALKONE_DEV_EXPORT_DIR answers it for scripted validation ("CANCEL" cancels; ';' separates a sequence),
 * and WALKONE_DEV_NO_REVEAL=1 suppresses opening Finder/Explorer.
 */
export function registerExportIpc(
  isTrustedSender: (e: IpcMainInvokeEvent) => boolean
): ExportService {
  const service = new ExportService({
    async chooseFolder(ctx, defaultPath) {
      const override = devValue('WALKONE_DEV_EXPORT_DIR')
      if (override) return override === 'CANCEL' ? null : override
      const options = {
        title: 'Export to Folder',
        buttonLabel: 'Export Here',
        properties: ['openDirectory' as const, 'createDirectory' as const],
        ...(defaultPath ? { defaultPath } : {})
      }
      const win = ctx instanceof BrowserWindow ? ctx : undefined
      const r = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return r.canceled || r.filePaths.length === 0 ? null : (r.filePaths[0] ?? null)
    },
    showItemInFolder(path) {
      if (devValue('WALKONE_DEV_NO_REVEAL') === '1') return
      shell.showItemInFolder(path)
    },
    log: (message, detail) => console.error(`[export] ${message}`, detail)
  })

  const guard =
    <A extends unknown[], R>(fn: (event: IpcMainInvokeEvent, ...args: A) => Promise<R>) =>
    (event: IpcMainInvokeEvent, ...args: A): Promise<R> => {
      if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
      return fn(event, ...args)
    }
  ipcMain.handle(
    IpcChannel.ExportChooseDestination,
    guard((e) => service.chooseDestination(BrowserWindow.fromWebContents(e.sender)))
  )
  ipcMain.handle(
    IpcChannel.ExportWrite,
    guard((_e, p: unknown) => service.write(p))
  )
  ipcMain.handle(
    IpcChannel.ExportReveal,
    guard((_e, p: unknown) => service.reveal(p))
  )
  return service
}
