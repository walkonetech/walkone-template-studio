import { useEffect, useState } from 'react'
import { PRINT_PRESET_IDS, type PrintPresetId } from '@domain'
import type { RecentProjectItem } from '@shared/ipc'
import { imageKey } from '@canvas/assets/imageCache'
import { renderProjectToCanvas } from '@canvas/rendering/renderProject'
import {
  selectActiveId,
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  selectViewTransform,
  type OpResult
} from '@editor/store'
import { EditorCanvas } from './EditorCanvas'
import { editorStore, imageCache, useEditor } from './editorStore'
import { installDebug } from './debugHooks'
import { useEditorKeyboard } from './useEditorKeyboard'

/**
 * Temporary production editor shell (Phase 3B): just enough controls to exercise the canvas foundation —
 * project lifecycle, selection actions, undo/redo, zoom and save. Final layout and styling come later.
 */
export function EditorScreen(): React.JSX.Element {
  useEditorKeyboard()
  const project = useEditor((s) => s.project)
  const fileName = useEditor((s) => s.session?.fileName ?? null)
  const dirty = useEditor(selectIsDirty)
  const canUndo = useEditor(selectCanUndo)
  const canRedo = useEditor(selectCanRedo)
  const activeId = useEditor(selectActiveId)
  const message = useEditor((s) => s.lastMessage)
  const snapping = useEditor((s) => s.snapping.enabled)
  const photoDisplay = useEditor((s) => s.photoDisplay)
  const scale = useEditor((s) => selectViewTransform(s)?.scale ?? null)
  const [preset, setPreset] = useState<PrintPresetId>('photo-4x6-portrait-600')
  const [recents, setRecents] = useState<RecentProjectItem[]>([])
  const st = editorStore.getState

  const active = project?.layers.find((l) => l.id === activeId)

  useEffect(() => {
    if (project) return
    let live = true
    void window.api.project.recents().then((r) => {
      if (live && r.status === 'ok') setRecents(r.value)
    })
    return () => {
      live = false
    }
  }, [project])

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

  /** Replacing the open project with unsaved changes asks first (full close/quit protection is still a later phase). */
  const confirmDiscard = (): boolean =>
    !selectIsDirty(st()) || window.confirm('Discard unsaved changes to the current project?')
  const guarded = (op: () => Promise<OpResult>) => async (): Promise<void> => {
    if (!confirmDiscard()) return
    await op()
  }

  return (
    <div className="editor">
      <header className="toolbar" role="toolbar" aria-label="Editor toolbar">
        <div className="group">
          <select
            aria-label="Print format"
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
            New
          </button>
          <button onClick={guarded(() => st().createSample())}>New sample</button>
          <button onClick={guarded(() => st().openFromDialog())}>Open…</button>
          <button disabled={!project} onClick={() => void st().save()}>
            Save
          </button>
          <button disabled={!project} onClick={() => void st().saveAs()}>
            Save As…
          </button>
          <button
            disabled={!project}
            onClick={async () => {
              if (confirmDiscard()) await st().closeProject()
            }}
          >
            Close
          </button>
        </div>
        <div className="group">
          <button disabled={!canUndo} onClick={() => st().undo()}>
            Undo
          </button>
          <button disabled={!canRedo} onClick={() => st().redo()}>
            Redo
          </button>
          <button disabled={!active} onClick={() => st().duplicateSelection()}>
            Duplicate
          </button>
          <button disabled={!active} onClick={() => st().deleteSelection()}>
            Delete
          </button>
          <button
            disabled={!active}
            onClick={() => active && st().setLocked(active.id, !active.locked)}
          >
            {active?.locked ? 'Unlock' : 'Lock'}
          </button>
          <button
            disabled={!active}
            onClick={() => active && st().setVisibility(active.id, !active.visible)}
          >
            {active?.visible === false ? 'Show' : 'Hide'}
          </button>
          <button disabled={!active} onClick={() => active && st().reorder(active.id, 'forward')}>
            Forward
          </button>
          <button disabled={!active} onClick={() => active && st().reorder(active.id, 'backward')}>
            Backward
          </button>
        </div>
        <div className="group">
          <button disabled={!project} onClick={() => st().zoomOut()}>
            −
          </button>
          <button disabled={!project} onClick={() => st().fitToWindow()}>
            Fit
          </button>
          <button disabled={!project} onClick={() => st().zoomToActualSize()}>
            100%
          </button>
          <button disabled={!project} onClick={() => st().zoomIn()}>
            +
          </button>
          <span className="zoom-label">{scale ? `${Math.round(scale * 100)}%` : '—'}</span>
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
      </header>

      <main className="workspace">
        {project ? (
          <EditorCanvas />
        ) : (
          <section className="home">
            <h1>WalkOne Template Studio</h1>
            <p className="subtitle">Photo booth print template builder</p>
            <p>Create or open a project to begin. (Temporary editor shell — Phase 3B.)</p>
            {recents.length > 0 && (
              <ul>
                {recents.map((r) => (
                  <li key={r.path}>
                    <button disabled={!r.exists} onClick={() => void st().openRecent(r.path)}>
                      {r.name}
                    </button>
                    {r.exists ? '' : ' (missing)'}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <footer className="statusbar" role="status">
        <span id="project-state">
          {project
            ? `${project.metadata.name} · ${fileName ?? 'unsaved'} · ${dirty ? '● modified' : 'saved'}`
            : 'No project open'}
        </span>
        <span id="selection-state">
          {active
            ? `${active.name} (${active.type}) x=${Math.round(active.x)} y=${Math.round(active.y)} w=${Math.round(active.width)} h=${Math.round(active.height)} rot=${Math.round(active.rotation)}`
            : 'No selection'}
        </span>
        {message && <span id="project-message">{message}</span>}
      </footer>
    </div>
  )
}
