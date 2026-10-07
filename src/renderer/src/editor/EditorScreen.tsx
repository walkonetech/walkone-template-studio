import { useEffect, useState } from 'react'
import { PRINT_PRESET_IDS, type PrintPresetId } from '@domain'
import type { RecentProjectItem } from '@shared/ipc'
import { imageKey } from '@canvas/assets/imageCache'
import { renderProjectToCanvas } from '@canvas/rendering/renderProject'
import { describePrint } from '@editor/describe'
import { NEW_LAYER_KINDS, type NewLayerKind } from '@editor/newLayers'
import {
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  selectViewTransform,
  type OpResult
} from '@editor/store'
import { EditorCanvas } from './EditorCanvas'
import { editorStore, imageCache, useEditor } from './editorStore'
import { installDebug } from './debugHooks'
import { LayersPanel } from './LayersPanel'
import { PropertiesInspector } from './PropertiesInspector'
import { primaryModifierLabel } from './platform'
import { useEditorKeyboard } from './useEditorKeyboard'

const st = editorStore.getState

/** Replacing or closing the open project with unsaved changes asks first (window close/quit protection is a later phase). */
const confirmDiscard = (): boolean =>
  !selectIsDirty(st()) || window.confirm('Discard unsaved changes to the current project?')
const guarded = (op: () => Promise<OpResult>) => async (): Promise<void> => {
  if (confirmDiscard()) await op()
}

function Toolbar(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const dirty = useEditor(selectIsDirty)
  const canUndo = useEditor(selectCanUndo)
  const canRedo = useEditor(selectCanRedo)
  const selectionCount = useEditor((s) => s.selectedIds.length)
  const mod = primaryModifierLabel()
  return (
    <header className="toolbar" role="toolbar" aria-label="Editor toolbar">
      <div className="doc-title" role="status">
        <strong id="doc-name">{project ? project.metadata.name : 'WalkOne Template Studio'}</strong>
        {project && (
          <span id="doc-state" className={dirty ? 'modified' : 'saved'}>
            {dirty ? '• Modified' : '• Saved'}
          </span>
        )}
      </div>
      <div className="group" role="group" aria-label="File">
        <button disabled={!project} onClick={() => void st().save()} title={`Save (${mod}S)`}>
          Save
        </button>
      </div>
      <div className="group" role="group" aria-label="History">
        <button disabled={!canUndo} onClick={() => st().undo()} title={`Undo (${mod}Z)`}>
          Undo
        </button>
        <button disabled={!canRedo} onClick={() => st().redo()} title={`Redo (Shift+${mod}Z)`}>
          Redo
        </button>
      </div>
      <div className="group" role="group" aria-label="Layers">
        <select
          aria-label="Add layer"
          disabled={!project}
          value=""
          onChange={(e) => {
            if (e.target.value) st().addNewLayer(e.target.value as NewLayerKind)
          }}
        >
          <option value="">Add layer…</option>
          {NEW_LAYER_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          disabled={selectionCount === 0}
          onClick={() => st().duplicateSelection()}
          title={`Duplicate (${mod}D)`}
        >
          Duplicate
        </button>
        <button
          disabled={selectionCount === 0}
          onClick={() => st().deleteSelection()}
          title="Delete (Delete)"
        >
          Delete
        </button>
        <button
          disabled={selectionCount === 0}
          onClick={() => st().groupSelection()}
          title={`Group (${mod}G)`}
        >
          Group
        </button>
        <button
          disabled={selectionCount === 0}
          onClick={() => st().ungroupSelection()}
          title={`Ungroup (Shift+${mod}G)`}
        >
          Ungroup
        </button>
      </div>
    </header>
  )
}

function ProjectRail(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const [preset, setPreset] = useState<PrintPresetId>('photo-4x6-portrait-600')
  const [recents, setRecents] = useState<RecentProjectItem[]>([])
  const fileName = useEditor((s) => s.session?.fileName ?? null)

  useEffect(() => {
    let live = true
    void window.api.project.recents().then((r) => {
      if (live && r.status === 'ok') setRecents(r.value)
    })
    return () => {
      live = false
    }
  }, [project, fileName])

  return (
    <nav className="rail" aria-label="Project" data-editor-panel>
      <h2>Project</h2>
      <label htmlFor="preset">Print format</label>
      <select
        id="preset"
        value={preset}
        onChange={(e) => setPreset(e.target.value as PrintPresetId)}
      >
        {PRINT_PRESET_IDS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <button onClick={guarded(() => st().createProject({ name: 'Untitled', preset }))}>
        New project
      </button>
      <button onClick={guarded(() => st().createSample())}>New sample project</button>
      <button onClick={guarded(() => st().openFromDialog())}>Open…</button>
      <button disabled={!project} onClick={() => void st().saveAs()}>
        Save As…
      </button>
      <button
        disabled={!project}
        onClick={async () => {
          if (confirmDiscard()) await st().closeProject()
        }}
      >
        Close project
      </button>
      {recents.length > 0 && (
        <>
          <h3>Recent</h3>
          <ul className="recent-list">
            {recents.map((r) => (
              <li key={r.path}>
                <button disabled={!r.exists} onClick={guarded(() => st().openRecent(r.path))}>
                  {r.name}
                </button>
                {r.exists ? '' : ' (missing)'}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="rail-note">Assets and design tools arrive in later phases.</p>
    </nav>
  )
}

function StatusBar(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const scale = useEditor((s) => selectViewTransform(s)?.scale ?? null)
  const selectionCount = useEditor((s) => s.selectedIds.length)
  const snapping = useEditor((s) => s.snapping.enabled)
  const photoDisplay = useEditor((s) => s.photoDisplay)
  const message = useEditor((s) => s.lastMessage)
  return (
    <footer className="statusbar" role="status">
      <span id="print-info">
        {project ? describePrint(project.canvas.print) : 'No project open'}
      </span>
      <span id="selection-info">
        {selectionCount === 0 ? 'No selection' : `${selectionCount} selected`}
      </span>
      {message && (
        <span id="project-message" role="alert">
          {message}{' '}
          <button className="link" onClick={() => st().setMessage(null)}>
            Dismiss
          </button>
        </span>
      )}
      <span className="spacer" />
      <div className="group" role="group" aria-label="View">
        <button disabled={!project} onClick={() => st().zoomOut()} aria-label="Zoom out">
          −
        </button>
        <span className="zoom-label" id="zoom-label" aria-live="polite">
          {scale ? `${Math.round(scale * 100)}%` : '—'}
        </span>
        <button disabled={!project} onClick={() => st().zoomIn()} aria-label="Zoom in">
          +
        </button>
        <button disabled={!project} onClick={() => st().fitToWindow()}>
          Fit
        </button>
        <button disabled={!project} onClick={() => st().zoomToActualSize()}>
          100%
        </button>
        <label>
          <input
            type="checkbox"
            checked={snapping}
            onChange={(e) => st().setSnapping({ enabled: e.target.checked })}
          />{' '}
          Snap
        </label>
        <label>
          <input
            type="checkbox"
            checked={photoDisplay === 'preview'}
            onChange={(e) => st().setPhotoDisplay(e.target.checked ? 'preview' : 'placeholder')}
          />{' '}
          Preview photos
        </label>
      </div>
    </footer>
  )
}

/**
 * Phase 4 editor layout: toolbar, project rail (left), canvas (center), Layers + Properties (right), status bar.
 * Canvas, Layers panel and Inspector are three views over the same store; none keeps its own copy of the layers.
 */
export function EditorScreen(): React.JSX.Element {
  useEditorKeyboard()
  const project = useEditor((s) => s.project)

  useEffect(() => {
    installDebug({
      store: editorStore,
      imageCache,
      renderToDataUrl: async (width, height) => {
        const s = editorStore.getState()
        if (!s.project || !s.session) throw new Error('no project')
        const sessionId = s.session.sessionId
        const ids = new Set<string>()
        for (const l of s.project.layers) {
          if (l.type === 'image') ids.add(l.assetId)
        }
        await imageCache.ensure([...ids].map((id) => imageKey(sessionId, id)))
        const t0 = performance.now()
        const canvas = renderProjectToCanvas(
          s.project,
          (id) => imageCache.peek(imageKey(sessionId, id)),
          {
            ...(width ? { width } : {}),
            ...(height ? { height } : {})
          }
        )
        return {
          width: canvas.width,
          height: canvas.height,
          dataUrl: canvas.toDataURL('image/png'),
          ms: Math.round(performance.now() - t0)
        }
      }
    })
  }, [])

  return (
    <div className="editor">
      <Toolbar />
      <div className="editor-body">
        <ProjectRail />
        <main className="workspace">
          {project ? (
            <EditorCanvas />
          ) : (
            <section className="home">
              <h1>WalkOne Template Studio</h1>
              <p className="subtitle">Photo booth print template builder</p>
              <p>Create or open a project from the Project panel to begin.</p>
            </section>
          )}
        </main>
        {project && (
          <aside className="side" aria-label="Layers and properties">
            <LayersPanel />
            <PropertiesInspector />
          </aside>
        )}
      </div>
      <StatusBar />
    </div>
  )
}
