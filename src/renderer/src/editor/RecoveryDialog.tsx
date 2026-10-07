import { useState } from 'react'
import type { RecoveryCandidateInfo } from '@shared/ipc'
import { editorStore, useEditor } from './editorStore'

const st = editorStore.getState

function describeConflict(c: RecoveryCandidateInfo): string | null {
  if (c.conflict === 'portable-changed')
    return 'The saved file changed after this copy was made. Recovering will not overwrite it; use Save As to keep both.'
  if (c.conflict === 'portable-missing')
    return 'The original saved file is no longer there. Use Save As after recovering.'
  return null
}

/**
 * Temporary startup recovery list (Phase 4B; visual design comes in Phase 4C). Nothing is restored automatically:
 * each unsaved session is offered with Recover or Discard (discard asks to confirm), and "Decide later" keeps them.
 */
export function RecoveryDialog(): React.JSX.Element | null {
  const candidates = useEditor((s) => s.recovery.candidates)
  const loaded = useEditor((s) => s.recovery.loaded)
  const dismissed = useEditor((s) => s.recovery.dismissed)
  const [confirming, setConfirming] = useState<string | null>(null)
  if (!loaded || dismissed || candidates.length === 0) return null

  const recover = async (id: string): Promise<void> => {
    if (!(await st().guardClose('replace'))) return
    await st().recoverCandidate(id)
  }

  return (
    <div
      className="recovery-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') st().dismissRecovery()
      }}
    >
      <div className="recovery-box">
        <h2 id="recovery-title">Recover unsaved work</h2>
        <p>
          WalkOne Template Studio closed before these projects were saved. Choose what to do with
          each; nothing is restored unless you choose Recover.
        </p>
        <ul className="recovery-list">
          {candidates.map((c, i) => (
            <li key={c.sessionId} data-session-id={c.sessionId}>
              <strong>{c.projectName || 'Untitled project'}</strong>
              <div>
                Recovery copy from {new Date(c.lastWorkingSaveAt).toLocaleString()} —{' '}
                {c.neverSaved ? 'never saved' : `saved file: ${c.originalFileName ?? 'unknown'}`}
              </div>
              {describeConflict(c) && <div role="note">Note: {describeConflict(c)}</div>}
              {c.missingAssets > 0 && (
                <div role="alert">
                  Warning: {c.missingAssets} image file(s) are missing; this copy cannot be fully
                  restored.
                </div>
              )}
              <div className="button-row">
                <button type="button" autoFocus={i === 0} onClick={() => void recover(c.sessionId)}>
                  Recover
                </button>
                {confirming === c.sessionId ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirming(null)
                        await st().discardCandidate(c.sessionId)
                      }}
                    >
                      Confirm discard (cannot be undone)
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirming(c.sessionId)}>
                    Discard
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => st().dismissRecovery()}>
          Decide later
        </button>
      </div>
    </div>
  )
}
