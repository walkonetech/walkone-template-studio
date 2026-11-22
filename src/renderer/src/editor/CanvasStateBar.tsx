import { Eye, PenLine } from 'lucide-react'
import { selectOutputProfile, selectViewMode } from '@editor/store'
import { safeAreasControl } from '@editor/layout'
import { runCommand } from './commandRunner'
import { editorStore, useEditor } from './editorStore'
import { tipProps } from './tips'
import { WorkspaceModeSwitch } from './WorkspaceModeSwitch'
import { Button } from '../ui/Button'
import { Tooltip } from '../ui/Tooltip'

/**
 * A view toggle shown as "Name: Value" (B1). `aria-pressed` carries the state; the visible value repeats it in words
 * so the state never depends on colour alone.
 */
function ViewToggle({
  name,
  value,
  pressed,
  disabled,
  onClick,
  tip,
  testId
}: {
  name: string
  value: string
  pressed: boolean
  disabled?: boolean
  onClick: () => void
  tip: { label: string; hint: string; shortcut?: string }
  testId: string
}): React.JSX.Element {
  return (
    <Tooltip {...tip}>
      <button
        type="button"
        className={`view-pill${pressed ? ' on' : ''}`}
        aria-label={name}
        aria-pressed={pressed}
        aria-disabled={disabled || undefined}
        data-testid={testId}
        onClick={() => {
          if (!disabled) onClick()
        }}
      >
        <span className="led" aria-hidden="true" />
        <span className="pill-name" aria-hidden="true">
          {name}:
        </span>
        <b aria-hidden="true">{value}</b>
      </button>
    </Tooltip>
  )
}

/**
 * The canvas-state bar, directly above the canvas (B1). VIEW controls only: if a control changes how the canvas is
 * viewed it may live here; if it changes the design itself, it does not. Nothing here marks the project Modified.
 */
export function CanvasStateBar(): React.JSX.Element {
  const viewMode = useEditor(selectViewMode)
  const showOverflow = useEditor((s) => s.showOverflow)
  const showCuts = useEditor((s) => s.showCutGuides)
  const showSafe = useEditor((s) => s.showSafeAreas)
  const profile = useEditor(selectOutputProfile)
  // A format's generic safe margin (B5.5) also gives the Safe areas view something to show without a printer profile.
  const hasGeneric = useEditor((s) => (s.project?.canvas.safeMarginMm ?? 0) > 0)
  const safe = safeAreasControl(profile !== null || hasGeneric, showSafe)
  return (
    <div
      className="viewbar"
      role="toolbar"
      aria-label="Canvas view"
      data-editor-panel
      data-region="viewbar"
    >
      <WorkspaceModeSwitch />
      <ViewToggle
        name="Safe areas"
        value={safe.value}
        pressed={safe.pressed}
        disabled={safe.disabled}
        testId="view-safe-areas"
        tip={
          safe.disabled
            ? { label: 'Safe areas unavailable', ...tipProps('safeAreasNoProfile') }
            : { label: 'Safe areas', ...tipProps('safeAreas') }
        }
        onClick={() => runCommand('view.safeAreas')}
      />
      <ViewToggle
        name="Overflow"
        value={showOverflow ? 'Show' : 'Hide'}
        pressed={showOverflow}
        testId="view-overflow"
        tip={{ label: 'Overflow', ...tipProps('overflow') }}
        onClick={() => runCommand('view.showOverflow')}
      />
      {viewMode === 'preview' && (
        <ViewToggle
          name="Cut guides"
          value={showCuts ? 'On' : 'Off'}
          pressed={showCuts}
          testId="view-cut-guides"
          tip={{ label: 'Cut guides', ...tipProps('cutGuides') }}
          onClick={() => runCommand('view.cutGuides')}
        />
      )}
      {viewMode === 'preview' && (
        <div className="viewbar-readonly" role="status" data-testid="preview-readonly">
          <span className="readonly-text">
            <Eye size={15} aria-hidden="true" />
            Print Preview · read only
          </span>
          <Tooltip label="Edit in Design" {...tipProps('editInDesign')}>
            <Button
              size="sm"
              icon={PenLine}
              onClick={() => editorStore.getState().setViewMode('design')}
            >
              Edit in Design
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
