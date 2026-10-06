import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type RendererApi } from '../shared/ipc'

const api: RendererApi = {
  ping: () => ipcRenderer.invoke(IpcChannel.AppPing)
}

contextBridge.exposeInMainWorld('api', api)
