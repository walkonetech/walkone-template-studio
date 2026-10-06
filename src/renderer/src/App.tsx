import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { IpcResult } from '@shared/persistence'
import type { OpenProjectInfo, PingResult, RecentProjectItem } from '@shared/ipc'

// Phase 3A spike (experimental, delete after the canvas decision): open the renderer with #canvas-spike.
const SpikeHarness = lazy(() =>
  import('./spikes/canvas/SpikeHarness').then((m) => ({ default: m.SpikeHarness }))
)

/**
 * DEVELOPMENT DIAGNOSTICS ONLY (Phase 2B): minimal controls to exercise the project lifecycle
 * through the typed IPC API. This is not the product UI and will be replaced.
 */
const subscribeHash = (cb: () => void): (() => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function App(): React.JSX.Element {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash)
  if (hash === '#canvas-spike') {
    return (
      <Suspense fallback={null}>
        <SpikeHarness />
      </Suspense>
    )
  }
  return <ProjectDiagnostics />
}

function ProjectDiagnostics(): React.JSX.Element {
  const [ping, setPing] = useState<PingResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState<OpenProjectInfo | null>(null)
  const [message, setMessage] = useState<string>('')
  const [recents, setRecents] = useState<RecentProjectItem[]>([])

  async function refreshRecents(): Promise<void> {
    const r = await window.api.project.recents()
    if (r.status === 'ok') setRecents(r.value)
  }

  useEffect(() => {
    window.api
      .ping()
      .then(setPing)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    window.api.project
      .recents()
      .then((r) => {
        if (r.status === 'ok') setRecents(r.value)
      })
      .catch(() => undefined)
  }, [])

  /** Applies an operation result; cancellation is silent, errors show their safe message. */
  function apply(result: IpcResult<OpenProjectInfo>, done: string): void {
    if (result.status === 'cancelled') return
    if (result.status === 'error') {
      setMessage(`Error (${result.error.code}): ${result.error.message}`)
      return
    }
    setCurrent(result.value)
    setMessage([done, ...result.value.warnings].join(' '))
    void refreshRecents()
  }

  const touch = async (): Promise<void> => {
    if (!current) return
    const project = {
      ...current.project,
      metadata: { ...current.project.metadata, updatedAt: new Date().toISOString() }
    }
    const r = await window.api.project.updateWorkingCopy({ sessionId: current.sessionId, project })
    if (r.status === 'ok') setCurrent({ ...current, project, dirty: r.value.dirty })
  }

  return (
    <main className="home">
      <h1>WalkOne Template Studio</h1>
      <p className="subtitle">Photo booth print template builder</p>
      <section className="empty-state">
        <p>No editor yet. Dev diagnostics for the project lifecycle (Phase 2B):</p>
        <p>
          <button
            onClick={async () =>
              apply(
                await window.api.project.create({
                  name: 'Untitled',
                  preset: 'photo-4x6-portrait-300'
                }),
                'New project.'
              )
            }
          >
            New
          </button>{' '}
          <button
            onClick={async () => apply(await window.api.project.newSample(), 'New sample project.')}
          >
            New (sample asset)
          </button>{' '}
          <button onClick={async () => apply(await window.api.project.open(), 'Opened.')}>
            Open…
          </button>{' '}
          <button
            disabled={!current}
            onClick={async () =>
              current &&
              apply(
                await window.api.project.save({
                  sessionId: current.sessionId,
                  project: current.project
                }),
                'Saved.'
              )
            }
          >
            Save
          </button>{' '}
          <button
            disabled={!current}
            onClick={async () =>
              current &&
              apply(
                await window.api.project.saveAs({
                  sessionId: current.sessionId,
                  project: current.project
                }),
                'Saved.'
              )
            }
          >
            Save As…
          </button>{' '}
          <button disabled={!current} onClick={() => void touch()}>
            Touch
          </button>{' '}
          <button
            disabled={!current}
            onClick={async () => {
              if (!current) return
              await window.api.project.close({ sessionId: current.sessionId })
              setCurrent(null)
              setMessage('Closed.')
            }}
          >
            Close
          </button>
        </p>
        <p id="project-state">
          {current
            ? `${current.project.metadata.name} · ${current.fileName ?? 'unsaved'} · ${current.dirty ? 'modified' : 'saved'} · ${current.project.assets.length} asset(s)`
            : 'No project open'}
        </p>
        {message && <p id="project-message">{message}</p>}
        {recents.length > 0 && (
          <ul>
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  disabled={!r.exists}
                  onClick={async () =>
                    apply(await window.api.project.openRecent({ path: r.path }), 'Opened recent.')
                  }
                >
                  {r.name}
                </button>
                {r.exists ? '' : ' (missing)'}
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className="status" role="status">
        {error
          ? `Shell check failed: ${error}`
          : ping
            ? `Shell OK · v${ping.appVersion} · ${ping.platform} · Electron ${ping.electronVersion}`
            : 'Checking shell…'}
      </footer>
    </main>
  )
}
