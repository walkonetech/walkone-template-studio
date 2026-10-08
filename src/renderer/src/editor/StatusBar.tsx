import { ImageIcon, Magnet, Minus, Plus } from 'lucide-react'
import { describeWorkspace } from '@editor/describe'
import { selectViewMode, selectViewTransform } from '@editor/store'
import { runCommand } from './commandRunner'
import { editorStore, useEditor } from './editorStore'
import { shortcutFor } from './TopBar'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'

const st = editorStore.getState

export function StatusBar(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const viewMode = useEditor(selectViewMode)
  const scale = useEditor((s) => selectViewTransform(s)?.scale ?? null)
  const selectionCount = useEditor((s) => s.selectedIds.length)
  const snapping = useEditor((s) => s.snapping.enabled)
  const photoDisplay = useEditor((s) => s.photoDisplay)
  const message = useEditor((s) => s.lastMessage)
  const autosave = useEditor((s) => s.autosave)
  const dirty = useEditor((s) => s.project !== null && s.project !== s.savedProject)
  // Healthy autosave is quiet: the recovery-copy time only appears while there is unsaved work it protects.
  const recoveryNote =
    dirty && autosave.state === 'saved' && autosave.lastSavedAt
      ? `Recovery copy ${new Date(autosave.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : ''
  return (
    <footer className="statusbar" aria-label="Status bar">
      <span id="print-info" className="status-item">
        {project ? describeWorkspace(project, viewMode) : 'No project open'}
      </span>
      {project && (
        <span id="selection-info" className="status-item muted">
          {selectionCount === 0 ? 'No selection' : `${selectionCount} selected`}
        </span>
      )}
      {message && (
        <span id="project-message" className="status-message" role="alert">
          {message}
          <button type="button" className="link" onClick={() => st().setMessage(null)}>
            Dismiss
          </button>
        </span>
      )}
      <span className="spacer" />
      <span id="autosave-info" className="status-item muted">
        {recoveryNote}
      </span>
      {project && (
        <div className="status-controls" role="group" aria-label="View">
          <IconButton
            size="sm"
            icon={Magnet}
            label="Snap to guides"
            pressed={snapping}
            onClick={() => runCommand('view.snap')}
            placement="top"
          />
          <IconButton
            size="sm"
            icon={ImageIcon}
            label="Preview photos (sample photos arrive in a later phase)"
            disabled
            pressed={photoDisplay === 'preview'}
            onClick={() => runCommand('view.previewPhotos')}
            placement="top"
          />
          <span className="ui-divider" aria-hidden="true" />
          <IconButton
            size="sm"
            icon={Minus}
            label="Zoom out"
            shortcut={shortcutFor('view.zoomOut')}
            onClick={() => st().zoomOut()}
            placement="top"
          />
          <span className="zoom-label" id="zoom-label" aria-live="polite">
            {scale ? `${Math.round(scale * 100)}%` : '—'}
          </span>
          <IconButton
            size="sm"
            icon={Plus}
            label="Zoom in"
            onClick={() => st().zoomIn()}
            placement="top"
          />
          <Button variant="ghost" size="sm" onClick={() => st().fitToWindow()}>
            Fit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => st().zoomToActualSize()}>
            100%
          </Button>
        </div>
      )}
    </footer>
  )
}
