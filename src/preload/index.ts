import { contextBridge, ipcRenderer } from 'electron'
import {
  IpcChannel,
  type DocumentHandler,
  type DocumentRequestMessage,
  type RendererApi
} from '../shared/ipc'

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
    readAsset: (req) => ipcRenderer.invoke(IpcChannel.ProjectReadAsset, req),
    importAssets: (req) => ipcRenderer.invoke(IpcChannel.ProjectImportAssets, req),
    importAssetData: (req) => ipcRenderer.invoke(IpcChannel.ProjectImportAssetData, req),
    pickPreviewPhoto: () => ipcRenderer.invoke(IpcChannel.ProjectPickPreviewPhoto)
  },
  recovery: {
    list: () => ipcRenderer.invoke(IpcChannel.RecoveryList),
    recover: (req) => ipcRenderer.invoke(IpcChannel.RecoveryRecover, req),
    discard: (req) => ipcRenderer.invoke(IpcChannel.RecoveryDiscard, req)
  },
  document: {
    requestClose: (req) => ipcRenderer.invoke(IpcChannel.DocumentRequestClose, req),
    setHandler: (handler: DocumentHandler) => {
      ipcRenderer.removeAllListeners(IpcChannel.DocumentRequest)
      ipcRenderer.on(IpcChannel.DocumentRequest, (_event, msg: DocumentRequestMessage) => {
        void handler(msg.kind).then((result) =>
          ipcRenderer.send(IpcChannel.DocumentResponse, { id: msg.id, result })
        )
      })
    }
  }
}

contextBridge.exposeInMainWorld('api', api)
