import {
  Clock,
  FolderOpen,
  Search,
  Settings,
  Plus,
  TriangleAlert,
  Upload,
  FileText,
  ChevronRight,
  Ruler
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RecentProjectItem } from '@shared/ipc'
import {
  describeWhen,
  filterRecents,
  formatPlaceholderSize,
  isStripFormat,
  recentMeta
} from '@editor/welcome'
import { guarded, runCommand } from './commandRunner'
import { isDebugSession } from './debugFlag'
import { editorStore, useEditor } from './editorStore'
import { shortcutFor } from './TopBar'
import { isMac } from './platform'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'
import { MyFormatsSection, openCustomFormat } from './MyFormats'

const st = editorStore.getState

/** Format imagery for the Blank design card (B1): the three print shapes, the strip highlighted. */
function BlankArt(): React.JSX.Element {
  return (
    <span className="start-art formats" aria-hidden="true">
      {[
        { label: '2×6', w: 26, h: 76, on: true },
        { label: '4×6', w: 48, h: 72, on: false },
        { label: '6×4', w: 72, h: 48, on: false }
      ].map((f) => (
        <span key={f.label} className="format">
          <span
            className={`format-shape${f.on ? ' on' : ''}`}
            style={{ width: f.w, height: f.h }}
          />
          <span className="format-label">{f.label}</span>
        </span>
      ))}
    </span>
  )
}

/** Custom size (B5.5): a small insert repeated on a sheet, with a ruler edge. Shapes only. */
function CustomArt(): React.JSX.Element {
  return (
    <span className="start-art custom" aria-hidden="true">
      <span className="custom-sheet">
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="format">
        <span className="format-shape" style={{ width: 44, height: 44 }} />
        <span className="format-label">Any size</span>
      </span>
    </span>
  )
}

/** The import metaphor (B1): a template file becoming an editable strip. */
function ImportArt(): React.JSX.Element {
  return (
    <span className="start-art import" aria-hidden="true">
      <FileText size={22} strokeWidth={1.5} />
      <ChevronRight size={18} strokeWidth={1.5} />
      <span className="strip">
        <span />
        <span />
        <span />
        <i />
      </span>
    </span>
  )
}

/**
 * A recent project's format, drawn as it prints (B5): the paper on a neutral tile, a 2×6 strip shown as its two
 * copies side by side on the sheet. There is no thumbnail store (that needs app-side image persistence; deferred), so
 * the card shows the format, never artwork or sample photos.
 */
function RecentArt({ item }: { item: RecentProjectItem }): React.JSX.Element {
  const size = formatPlaceholderSize(item.print, 88)
  const strip = isStripFormat(item.print)
  return (
    <span className="recent-art" aria-hidden="true">
      {strip ? (
        <span className="recent-sheet">
          <span className="recent-shape" style={size} />
          <span className="recent-shape" style={size} />
        </span>
      ) : (
        <span className={`recent-shape${item.print ? '' : ' unknown'}`} style={size} />
      )}
    </span>
  )
}

/**
 * Banner for recovery copies the user put off with "Decide later" (B1). It never restores anything itself: Review
 * shows the same recovery choices again (Recover / Discard / Decide later); Not now hides the banner until next launch.
 */
function RecoveryBanner(): React.JSX.Element | null {
  const candidates = useEditor((s) => s.recovery.candidates)
  const loaded = useEditor((s) => s.recovery.loaded)
  const dismissed = useEditor((s) => s.recovery.dismissed)
  const [hidden, setHidden] = useState(false)
  if (!loaded || !dismissed || hidden || candidates.length === 0) return null
  const first = candidates[0]
  const text =
    candidates.length === 1 && first ? (
      <>
        <strong>Unsaved changes to “{first.projectName || 'Untitled project'}” were kept</strong>{' '}
        from {describeWhen(first.lastWorkingSaveAt)}.
      </>
    ) : (
      <>
        <strong>Unsaved work from {candidates.length} projects was kept.</strong>
      </>
    )
  return (
    <div className="start-banner" role="status" data-testid="recovery-banner">
      <Clock size={17} aria-hidden="true" />
      <span className="grow">{text}</span>
      <Button size="sm" onClick={() => st().reviewRecovery()}>
        Review
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setHidden(true)}>
        Not now
      </Button>
    </div>
  )
}

/**
 * The Start screen (B1): Blank design and Import dslrBooth as visual cards, Open project…, recent projects as cards,
 * and recovered work as a banner. Guided Design is not shown until it works (Phase 7C).
 */
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
  const openKeys = shortcutFor('file.open')
  const [query, setQuery] = useState('')
  const shown = recents ? filterRecents(recents, query) : null
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="welcome-head">
          <div>
            <h1 id="welcome-title">Start a template</h1>
            <p>Design a print template for dslrBooth, or pick up where you left off.</p>
          </div>
          <div className="welcome-actions">
            <Tooltip
              label="Settings"
              hint="Theme, button size, interface scale and editor helpers"
              shortcut={shortcutFor('app.settings')}
            >
              <Button
                variant="ghost"
                icon={Settings}
                id="start-settings"
                onClick={() => runCommand('app.settings')}
              >
                Settings
              </Button>
            </Tooltip>
            {isDebugSession() && (
              <Button
                variant="ghost"
                onClick={() => void guarded('replace', () => st().createSample())()}
              >
                New sample project
              </Button>
            )}
            <Tooltip
              label="Open project"
              hint="Open a saved .boothproject file"
              shortcut={openKeys}
            >
              <Button
                size="lg"
                icon={FolderOpen}
                id="open-project"
                aria-label="Open project…"
                aria-keyshortcuts={isMac() ? 'Meta+O' : 'Control+O'}
                onClick={() => runCommand('file.open')}
              >
                Open project…
                <kbd className="btn-kbd" aria-hidden="true">
                  {openKeys}
                </kbd>
              </Button>
            </Tooltip>
          </div>
        </div>
        <RecoveryBanner />
        <div className="start-cards">
          <button
            type="button"
            className="start-card"
            id="start-blank"
            aria-describedby="start-blank-desc"
            onClick={() => runCommand('file.new')}
          >
            <BlankArt />
            <span className="start-card-title">
              <Plus size={20} aria-hidden="true" />
              Blank design
            </span>
            <span className="start-card-desc" id="start-blank-desc">
              Choose a print size and design it your way in the full editor.
            </span>
          </button>
          <button
            type="button"
            className="start-card"
            id="start-custom"
            aria-describedby="start-custom-desc"
            onClick={() => openCustomFormat(null)}
          >
            <CustomArt />
            <span className="start-card-title">
              <Ruler size={20} aria-hidden="true" />
              Custom size
            </span>
            <span className="start-card-desc" id="start-custom-desc">
              Magnets, keychains, wallet prints, squares: any size, printed as is or repeated on a
              sheet.
            </span>
          </button>
          <button
            type="button"
            className="start-card"
            id="start-import"
            aria-describedby="start-import-desc"
            onClick={() => runCommand('file.importDslr')}
          >
            <ImportArt />
            <span className="start-card-title">
              <Upload size={20} aria-hidden="true" />
              Import dslrBooth
            </span>
            <span className="start-card-desc" id="start-import-desc">
              Turn a dslrBooth template (.zip) into a project you can edit.
            </span>
          </button>
        </div>
        <MyFormatsSection />
        <div className="start-recent-head">
          <h2 className="start-heading">Recent</h2>
          {recents && recents.length > 0 && (
            <label className="recent-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">Search recent projects</span>
              <input
                type="search"
                className="ui-input"
                placeholder="Search recent"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="recent-search"
              />
            </label>
          )}
        </div>
        {recents === null || shown === null ? null : recents.length === 0 ? (
          <p className="welcome-empty">Projects you open or save will appear here.</p>
        ) : shown.length === 0 ? (
          <p className="welcome-empty">No recent project matches “{query}”.</p>
        ) : (
          <ul className="recent-grid" aria-label="Recent projects">
            {shown.map((r) => (
              <li key={r.path} className={r.exists ? '' : 'missing'}>
                <button
                  type="button"
                  className="recent-card"
                  disabled={!r.exists}
                  onClick={() => void guarded('replace', () => st().openRecent(r.path))()}
                >
                  <RecentArt item={r} />
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-when">{recentMeta(r)}</span>
                </button>
                {!r.exists && (
                  <span className="recent-missing">
                    <span>
                      <TriangleAlert size={14} aria-hidden="true" /> File not found
                    </span>
                    <Tooltip
                      label="Locate…"
                      hint="The file was moved or renamed. Find it and open it from its new place."
                    >
                      <button
                        type="button"
                        className="link"
                        aria-label={`Locate ${r.name}…`}
                        onClick={() => void guarded('replace', () => st().locateRecent(r.path))()}
                      >
                        Locate…
                      </button>
                    </Tooltip>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
