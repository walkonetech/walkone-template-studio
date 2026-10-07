import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import {
  IpcChannel,
  type CloseDecision,
  type CloseReason,
  type DocumentRequestKind,
  type DocumentResponseMessage,
  type DocumentResult,
  type DocumentState
} from '../shared/ipc'
import type { IpcResult } from '../shared/persistence'
import type { ProjectService } from '../projects/service'
import { CloseCoordinator, type SaveOutcome, type UnsavedChoice } from './closeCoordinator'
import { devValue } from './devOverrides'

/**
 * Electron wiring for close/quit protection (ADR-034). The MAIN process owns the decision; the renderer only
 * answers questions ("what is the document state?", "please save").
 *
 * macOS lifecycle: Cmd+Q / app.quit() fire `before-quit` BEFORE any window `close`; the red window button fires only
 * `close` (the app stays alive). Both are intercepted. After an approved decision we set approval flags and call
 * win.close()/app.quit() again; the flags make the second pass go straight through, so there is no loop and no second
 * prompt. Working sessions are deleted only AFTER approval (never before a Save has succeeded).
 */
const STATE_TIMEOUT_MS = 1500

export function setupDocumentLifecycle(options: {
  service: ProjectService
  isTrustedSender: (e: IpcMainInvokeEvent | IpcMainEvent) => boolean
}): { attachWindow: (win: BrowserWindow) => void } {
  const { service, isTrustedSender } = options
  let nextId = 1
  const pending = new Map<number, (r: DocumentResult) => void>()
  const approvedWindows = new WeakSet<BrowserWindow>()
  const goneWindows = new WeakSet<BrowserWindow>()
  let quitApproved = false

  const liveWindow = (): BrowserWindow | null =>
    BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !goneWindows.has(w)) ?? null

  ipcMain.on(IpcChannel.DocumentResponse, (event, msg: DocumentResponseMessage) => {
    if (!isTrustedSender(event)) return
    pending.get(msg.id)?.(msg.result)
    pending.delete(msg.id)
  })

  function ask(kind: DocumentRequestKind, timeoutMs?: number): Promise<DocumentResult | null> {
    const win = liveWindow()
    if (!win) return Promise.resolve(null)
    return new Promise((resolve) => {
      const id = nextId++
      let timer: NodeJS.Timeout | undefined
      pending.set(id, (r) => {
        if (timer) clearTimeout(timer)
        resolve(r)
      })
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          pending.delete(id)
          resolve(null)
        }, timeoutMs)
      }
      win.webContents.send(IpcChannel.DocumentRequest, { id, kind })
    })
  }

  async function prompt(state: DocumentState, reason: CloseReason): Promise<UnsavedChoice> {
    const override = devValue('WALKONE_DEV_UNSAVED_CHOICES')
    if (override === 'save' || override === 'discard' || override === 'cancel') return override
    const win = liveWindow()
    const name = state.name ?? 'Untitled'
    const options = {
      type: 'warning' as const,
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: `Do you want to save the changes you made to "${name}"?`,
      detail:
        reason === 'quit' || reason === 'window-close'
          ? "Your changes will be lost if you don't save them."
          : "Your changes will be lost if you don't save them before continuing."
    }
    const r = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return r.response === 0 ? 'save' : r.response === 1 ? 'discard' : 'cancel'
  }

  const coordinator = new CloseCoordinator({
    queryState: async () => {
      const r = await ask('state', STATE_TIMEOUT_MS)
      return r && r.kind === 'state' ? r.state : null
    },
    prompt,
    requestSave: async (): Promise<SaveOutcome> => {
      const r = await ask('save')
      return r && r.kind === 'save' ? r.status : 'failed'
    },
    onSaveFailed: () => console.error('[lifecycle] save before close failed; keeping the app open')
  })

  const REASONS = new Set<CloseReason>(['close-project', 'replace'])
  ipcMain.handle(
    IpcChannel.DocumentRequestClose,
    async (event, payload: { reason?: string }): Promise<IpcResult<CloseDecision>> => {
      if (!isTrustedSender(event)) throw new Error('Untrusted IPC sender')
      const reason = payload?.reason as CloseReason
      if (!REASONS.has(reason)) {
        return {
          status: 'error',
          error: { code: 'invalid-request', message: 'The request was not valid.' }
        }
      }
      const outcome = await coordinator.requestClose(reason)
      return { status: 'ok', value: { proceed: outcome.proceed } }
    }
  )

  app.on('before-quit', (event) => {
    if (quitApproved) return
    event.preventDefault()
    void coordinator.requestClose('quit').then(async (o) => {
      if (!o.proceed) return
      if (o.cleanup) await service.closeAll()
      quitApproved = true
      for (const w of BrowserWindow.getAllWindows()) approvedWindows.add(w)
      app.quit()
    })
  })

  return {
    attachWindow(win) {
      win.webContents.on('render-process-gone', () => goneWindows.add(win))
      win.on('close', (event) => {
        if (approvedWindows.has(win)) return
        event.preventDefault()
        void coordinator.requestClose('window-close').then(async (o) => {
          if (!o.proceed || win.isDestroyed()) return
          if (o.cleanup) await service.closeAll()
          approvedWindows.add(win)
          win.close()
        })
      })
    }
  }
}
