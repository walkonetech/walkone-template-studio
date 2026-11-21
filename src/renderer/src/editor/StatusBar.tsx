import { Magnet, Minus, Plus, Printer } from 'lucide-react'
import { describeWorkspace } from '@editor/describe'
import { selectOutputProfile, selectViewMode, selectViewTransform } from '@editor/store'
import { confidenceStep, type ConfidenceStep } from '@output'

const STEP_WORD: Record<ConfidenceStep, string> = {
  estimated: 'Estimated',
  tested: 'Tested',
  measured: 'Measured'
}
import { layoutStore } from './layoutStore'
import { useSafeAreaReport } from './SafeAreaOverlay'
import { runCommand } from './commandRunner'
import { editorStore, useEditor } from './editorStore'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Tooltip } from '../ui/Tooltip'
import { commandTipProps, tipProps } from './tips'

const st = editorStore.getState

/**
 * Status bar (B1): facts and state only (format, selection, recovery copy, Output profile, snapping, zoom). The view
 * toggles (safe areas, overflow, Design/Print Preview) live in the canvas-state bar above the canvas.
 */
export function StatusBar(): React.JSX.Element {
  const project = useEditor((s) => s.project)
  const viewMode = useEditor(selectViewMode)
  const scale = useEditor((s) => selectViewTransform(s)?.scale ?? null)
  const selectionCount = useEditor((s) => s.selectedIds.length)
  const snapping = useEditor((s) => s.snapping.enabled)
  const message = useEditor((s) => s.lastMessage)
  const autosave = useEditor((s) => s.autosave)
  const dirty = useEditor((s) => s.project !== null && s.project !== s.savedProject)
  // Healthy autosave is quiet: the recovery-copy time only appears while there is unsaved work it protects.
  const recoveryNote =
    dirty && autosave.state === 'saved' && autosave.lastSavedAt
      ? `Recovery copy ${new Date(autosave.lastSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : ''
  return (
    <footer className="statusbar" aria-label="Status bar" data-region="statusbar">
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
          <span className="status-message-text" title={message}>
            {message}
          </span>
          <button type="button" className="link" onClick={() => st().setMessage(null)}>
            Dismiss
          </button>
        </span>
      )}
      <span className="spacer" />
      {project && <OutputStatus />}
      <span id="autosave-info" className="status-item muted">
        {recoveryNote}
      </span>
      {project && (
        <div className="status-controls" role="group" aria-label="View">
          <Tooltip label="Snap to guides" {...commandTipProps('view.snap')} placement="top">
            <button
              type="button"
              className={`status-toggle${snapping ? ' on' : ''}`}
              aria-label="Snap to guides"
              aria-pressed={snapping}
              onClick={() => runCommand('view.snap')}
            >
              <Magnet size={14} aria-hidden="true" />
              Snap
            </button>
          </Tooltip>
          <span className="ui-divider" aria-hidden="true" />
          <IconButton
            size="sm"
            icon={Minus}
            label="Zoom out"
            {...commandTipProps('view.zoomOut')}
            onClick={() => st().zoomOut()}
            placement="top"
          />
          <Tooltip label="Zoom level" {...tipProps('zoomLevel')} placement="top">
            <span className="zoom-label" id="zoom-label" aria-live="polite">
              {scale ? `${Math.round(scale * 100)}%` : '—'}
            </span>
          </Tooltip>
          <IconButton
            size="sm"
            icon={Plus}
            label="Zoom in"
            {...commandTipProps('view.zoomIn')}
            onClick={() => st().zoomIn()}
            placement="top"
          />
          <Tooltip label="Fit to artboard" {...commandTipProps('view.fit')} placement="top">
            <Button variant="ghost" size="sm" onClick={() => st().fitToWindow()}>
              Fit
            </Button>
          </Tooltip>
          <Tooltip label="Actual size" {...commandTipProps('view.actual')} placement="top">
            <Button variant="ghost" size="sm" onClick={() => st().zoomToActualSize()}>
              100%
            </Button>
          </Tooltip>
        </div>
      )}
    </footer>
  )
}

/**
 * Compact printer status (ADR-053; B4 wording), e.g. "DNP DS-RX1 · Tested · 2 near an edge". The friendly step comes
 * from the profile's evidence (Estimated · Tested · Measured; never "verified"). Opens View › Printer & cutting….
 * Never part of the project.
 */
function OutputStatus(): React.JSX.Element {
  const report = useSafeAreaReport()
  const profile = useEditor(selectOutputProfile)
  const r = report?.resolution
  const flagged = report?.flagged.length ?? 0
  let extra = ''
  let tone = ''
  if (r?.status === 'mismatch') {
    extra = ' · does not match this project'
    tone = ' warn'
  } else if (flagged > 0) {
    extra = ` · ${flagged} near an edge`
    tone = ' warn'
  }
  return (
    <Tooltip label="Printer & cutting" {...commandTipProps('view.outputProfile')} placement="top">
      <button
        type="button"
        id="output-status"
        className={`status-chip${tone}`}
        onClick={() => layoutStore.getState().setOutputProfileOpen(true)}
      >
        <Printer size={13} aria-hidden="true" />
        <span className="chip-text">
          {profile
            ? `${profile.shortName} · ${STEP_WORD[confidenceStep(profile.confidence)]}`
            : 'No printer'}
          {extra}
        </span>
      </button>
    </Tooltip>
  )
}
