import type { CloseReason, DocumentState } from '../shared/ipc'

/**
 * Single place that decides whether the open document may be closed, replaced or quit (ADR-034). Electron-free,
 * so every path (window close, Cmd+Q, Close Project, New/Open) and every outcome can be unit-tested.
 *
 *   clean or no project        -> proceed (cleanup allowed)
 *   modified -> prompt:
 *       Save        -> renderer saves (Save As if never saved) -> proceed ONLY if it reports "saved"
 *       Don't Save  -> proceed (cleanup allowed: the user discarded the work)
 *       Cancel / dismissed / prompt error -> abort
 *   renderer unavailable (crashed/gone)    -> proceed WITHOUT cleanup, so recovery data survives
 *
 * Concurrent requests (e.g. window close and Cmd+Q together) share one in-flight decision: one prompt, never two.
 */
export type UnsavedChoice = 'save' | 'discard' | 'cancel'
export type SaveOutcome = 'saved' | 'cancelled' | 'failed'

export interface CloseDeps {
  /** The renderer's current document state, or null if no renderer can answer. */
  queryState(): Promise<DocumentState | null>
  prompt(state: DocumentState, reason: CloseReason): Promise<UnsavedChoice>
  requestSave(): Promise<SaveOutcome>
  onSaveFailed?(): void
}

export interface CloseOutcome {
  /** May the close/quit continue? */
  proceed: boolean
  /** Is it safe to delete the working sessions (clean, saved or explicitly discarded)? */
  cleanup: boolean
}

export class CloseCoordinator {
  private inFlight: Promise<CloseOutcome> | null = null

  constructor(private readonly deps: CloseDeps) {}

  requestClose(reason: CloseReason): Promise<CloseOutcome> {
    if (this.inFlight) return this.inFlight
    const p = this.decide(reason).finally(() => {
      this.inFlight = null
    })
    this.inFlight = p
    return p
  }

  private async decide(reason: CloseReason): Promise<CloseOutcome> {
    const state = await this.deps.queryState().catch(() => null)
    if (state === null) return { proceed: true, cleanup: false }
    if (!state.hasProject || !state.dirty) return { proceed: true, cleanup: true }
    const choice = await this.deps.prompt(state, reason).catch((): UnsavedChoice => 'cancel')
    if (choice === 'cancel') return { proceed: false, cleanup: false }
    if (choice === 'discard') return { proceed: true, cleanup: true }
    const outcome = await this.deps.requestSave().catch((): SaveOutcome => 'failed')
    if (outcome === 'saved') return { proceed: true, cleanup: true }
    if (outcome === 'failed') this.deps.onSaveFailed?.()
    return { proceed: false, cleanup: false }
  }
}
