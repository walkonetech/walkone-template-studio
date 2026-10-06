/** IPC contract shared by main, preload and renderer. Keep payloads plain, serializable data. */

export const IpcChannel = {
  AppPing: 'app:ping'
} as const

export interface PingResult {
  ok: true
  appVersion: string
  platform: string
  electronVersion: string
}

/** The only API the renderer can reach; exposed on `window.api` by the preload script. */
export interface RendererApi {
  ping(): Promise<PingResult>
}
