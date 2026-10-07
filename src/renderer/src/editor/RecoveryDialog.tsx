import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import type { RecoveryCandidateInfo } from '@shared/ipc'
import { describeWhen } from '@editor/welcome'
import { editorStore, useEditor } from './editorStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

const st = editorStore.getState

function fileStatus(c: RecoveryCandidateInfo): string {
  if (c.neverSaved) return 'Never saved to a file'
  const file = c.originalFileName ?? 'its file'
  if (c.conflict === 'portable-changed')
    return `${file} has changed since this copy was made. Recovering will not overwrite it; use Save As to keep both.`
  if (c.conflict === 'portable-missing')
    return `${file} is no longer where it was saved. After recovering, use Save As.`
  return `Saved file: ${file}`
}

/**
 * Startup recovery. Nothing is restored automatically: each unsaved session is offered with Recover or Discard
 * (Discard asks to confirm), and "Decide later" keeps them all for the next launch. Calm, not alarming: this is the
 * normal outcome of a crash or force-quit, not a corruption.
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
    <Dialog
      title="We found unsaved work from a previous session"
      description="Your project was open when the app closed unexpectedly. Nothing is restored unless you choose Recover."
      onEscape={() => st().dismissRecovery()}
      footer={
        <Button variant="ghost" onClick={() => st().dismissRecovery()}>
          Decide later
        </Button>
      }
    >
      <ul className="recovery-list" aria-label="Recoverable projects">
        {candidates.map((c, i) => (
          <li key={c.sessionId} data-session-id={c.sessionId} className="recovery-item">
            <div className="recovery-head">
              <strong>{c.projectName || 'Untitled project'}</strong>
              <span className="muted">
                Recovery copy from {describeWhen(c.lastWorkingSaveAt)} ·{' '}
                {new Date(c.lastWorkingSaveAt).toLocaleString([], {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </span>
            </div>
            <p className="recovery-file" role="note">
              {fileStatus(c)}
            </p>
            {c.missingAssets > 0 && (
              <p className="recovery-warn" role="alert">
                <TriangleAlert size={14} aria-hidden="true" /> {c.missingAssets} image file
                {c.missingAssets === 1 ? ' is' : 's are'} missing, so this copy cannot be fully
                restored.
              </p>
            )}
            <div className="recovery-actions">
              <Button
                variant="primary"
                size="sm"
                {...(i === 0 ? { 'data-autofocus': true } : {})}
                onClick={() => void recover(c.sessionId)}
              >
                Recover
              </Button>
              {confirming === c.sessionId ? (
                <>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={async () => {
                      setConfirming(null)
                      await st().discardCandidate(c.sessionId)
                    }}
                  >
                    Confirm discard (cannot be undone)
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setConfirming(c.sessionId)}>
                  Discard
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
