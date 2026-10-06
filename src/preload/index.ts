import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type RendererApi } from '../shared/ipc'

const api: RendererApi = {
  ping: () => ipcRenderer.invoke(IpcChannel.AppPing),
  project: {
    create: (req) => ipcRenderer.invoke(IpcChannel.ProjectNew, req),
    newSample: () => ipcRenderer.invoke(IpcChannel.ProjectNewSample),
    open: () => ipcRenderer.invoke(IpcChannel.ProjectOpen),
    openRecent: (req) => ipcRenderer.invoke(IpcChannel.ProjectOpenRecent, req),
    save: (req) => ipcRenderer.invoke(IpcChannel.ProjectSave, req),
    saveAs: (req) => ipcRenderer.invoke(IpcChannel.ProjectSaveAs, req),
    updateWorkingCopy: (req) => ipcRenderer.invoke(IpcChannel.ProjectUpdateWorkingCopy, req),
    close: (req) => ipcRenderer.invoke(IpcChannel.ProjectClose, req),
    recents: () => ipcRenderer.invoke(IpcChannel.ProjectRecents),
    readAsset: (req) => ipcRenderer.invoke(IpcChannel.ProjectReadAsset, req)
  }
}

contextBridge.exposeInMainWorld('api', api)
