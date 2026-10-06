import { app, BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { IpcChannel, type PingResult } from '../shared/ipc'

const isDev = !app.isPackaged && Boolean(process.env['ELECTRON_RENDERER_URL'])

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? ''
  if (isDev) return url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '')
  return url.startsWith('file://')
}

function registerIpc(): void {
  ipcMain.handle(IpcChannel.AppPing, (event): PingResult => {
    if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
    return {
      ok: true,
      appVersion: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron
    }
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
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

void app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
