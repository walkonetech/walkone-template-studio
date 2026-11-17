import { FileInput, FilePlus2, FolderOpen, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RecentProjectItem } from '@shared/ipc'
import { describeWhen } from '@editor/welcome'
import { guarded, runCommand } from './commandRunner'
import { isDebugSession } from './debugFlag'
import { editorStore } from './editorStore'
import { shortcutFor } from './TopBar'
import { Button } from '../ui/Button'

const st = editorStore.getState

/** The no-project state: start something new, open a file, or pick up where you left off. */
export function Welcome(): React.JSX.Element {
  const [recents, setRecents] = useState<RecentProjectItem[] | null>(null)
  useEffect(() => {
    let live = true
    void window.api.project.recents().then((r) => {
      if (live) setRecents(r.status === 'ok' ? r.value : [])
    })
    return () => {
      live = false
    }
  }, [])
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="welcome-head">
          <span className="brand-mark lg" aria-hidden="true" />
          <h1 id="welcome-title">WalkOne Template Studio</h1>
          <p>Build print templates for your photo booth.</p>
        </div>
        <div className="welcome-actions">
          <Button variant="primary" icon={FilePlus2} onClick={() => runCommand('file.new')}>
            New project
          </Button>
          <Button icon={FolderOpen} onClick={() => runCommand('file.open')}>
            Open project…
          </Button>
          <Button
            icon={FileInput}
            title="Turn a dslrBooth template ZIP into a new project you can edit"
            onClick={() => runCommand('file.importDslr')}
          >
            Import from dslrBooth…
          </Button>
          {isDebugSession() && (
            <Button
              variant="ghost"
              onClick={() => void guarded('replace', () => st().createSample())()}
            >
              New sample project
            </Button>
          )}
        </div>
        <p className="welcome-hint">
          New {shortcutFor('file.new')} · Open {shortcutFor('file.open')}
        </p>
        <h2 className="section-heading">Recent projects</h2>
        {recents === null ? null : recents.length === 0 ? (
          <p className="welcome-empty">Projects you open or save will appear here.</p>
        ) : (
          <ul className="recent-grid" aria-label="Recent projects">
            {recents.map((r) => (
              <li key={r.path}>
                <button
                  type="button"
                  className="recent-card"
                  disabled={!r.exists}
                  onClick={() => void guarded('replace', () => st().openRecent(r.path))()}
                >
                  <span className="recent-name">{r.name}</span>
                  {r.exists ? (
                    <span className="recent-when">Opened {describeWhen(r.lastOpenedAt)}</span>
                  ) : (
                    <span className="recent-missing">
                      <TriangleAlert size={12} aria-hidden="true" /> File not found
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
