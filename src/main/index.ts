import { app, BrowserWindow, ipcMain, session, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IpcChannel, type PingResult } from '../shared/ipc'
import { registerProjectIpc } from './projectIpc'
import type { ProjectService } from '../projects/service'
import { devValue } from './devOverrides'
import { installAppMenu } from './appMenu'
import { setupDocumentLifecycle } from './documentLifecycle'

const isDev = !app.isPackaged && Boolean(process.env['ELECTRON_RENDERER_URL'])

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (isDev) return url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')
  return url.startsWith('file://')
}

/**
 * Permission policy (ADR-039). Electron grants every permission request by default; the app needs exactly one: reading
 * the NAMES of installed fonts (`local-fonts`, the Local Font Access API) for the font picker, and only for the app's
 * own pages. Everything else is denied. The API exposes family/style names, never file paths.
 */
function installPermissionPolicy(): void {
  const trusted = (url: string): boolean =>
    isDev ? url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0') : url.startsWith('file://')
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(permission === 'local-fonts' && trusted(details.requestingUrl))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return permission === 'local-fonts' && trusted(requestingOrigin)
  })
}

function registerIpc(): ProjectService {
  ipcMain.handle(IpcChannel.AppPing, (event): PingResult => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    return {
      ok: true,
      appVersion: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron
    }
  })
  return registerProjectIpc(isTrustedSender)
}

function createWindow(attach: (win: BrowserWindow) => void): void {
  // Development/validation only (ignored when packaged): WALKONE_DEV_WINDOW_SIZE=1440x900
  const forced = /^(\d{3,4})x(\d{3,4})$/.exec(devValue('WALKONE_DEV_WINDOW_SIZE') ?? '')
  const win = new BrowserWindow({
    width: forced ? Number(forced[1]) : 1360,
    height: forced ? Number(forced[2]) : 860,
    // Below this the canvas (with the side panels) stops being usable; see docs/UX_SPEC.md.
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#17181c', // matches --c-app so there is no white flash before the renderer paints
    show: false,
    title: 'WalkOne Template Studio',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  attach(win)
  win.once('ready-to-show', () => win.show())

  // Never open new app windows; send http(s) links to the OS browser only.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Block in-app navigation away from the app's own content.
  win.webContents.on('will-navigate', (event, url) => {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    if (!(isDev && rendererUrl && url.startsWith(rendererUrl))) event.preventDefault()
  })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (isDev && rendererUrl) void win.loadURL(rendererUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

// One running instance per user-data folder: sessions found at startup therefore always belong to a dead run.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void app.whenReady().then(async () => {
    installAppMenu()
    installPermissionPolicy()
    const service: ProjectService = registerIpc()
    await service.scanRecovery().catch((e) => console.error('[recovery] startup scan failed', e))
    const lifecycle = setupDocumentLifecycle({ service, isTrustedSender })
    createWindow(lifecycle.attachWindow)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow(lifecycle.attachWindow)
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
