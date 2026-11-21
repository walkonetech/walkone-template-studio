import { useEffect } from 'react'
import { X } from 'lucide-react'
import { checksButtonState } from '@editor/checks'
import { panelReturnsFocus, type DrawerMode } from '@editor/layout'
import { CheckCounts, CheckGroups, TONE_ICON, useProjectChecks } from './CheckList'
import { tipProps } from './tips'
import { layoutStore, useLayout } from './layoutStore'
import { IconButton } from '../ui/IconButton'
import { Tooltip } from '../ui/Tooltip'
import { restoreFocus } from '../ui/restoreFocus'

/**
 * Closes the Checks panel and hands focus back to the top-bar Checks button when the panel owned it: focus inside
 * the panel (a control, or the panel itself after a click on its heading, text or blank space, since the panel is
 * focusable), or focus stranded on the page with nothing focused. Focus the user moved to another control is left
 * there. Uses the shared programmatic restoration (B3.1), so no stale tooltip appears and the ring shows when the
 * user is on the keyboard.
 */
export function closeChecksReturningFocus(): void {
  const active = document.activeElement
  const owned = panelReturnsFocus({
    focusInPanel: active?.closest('#checks-panel') != null,
    focusOnPage: active === null || active === document.body || active === document.documentElement
  })
  layoutStore.getState().setChecksOpen(false)
  if (owned) restoreFocus(document.getElementById('checks-button'))
}

/**
 * Keyboard entry into the Checks panel: its first actionable control (a group heading or a card action), else the
 * panel itself (a labelled landmark: a Ready panel has no actions to land on). The header's Close button is not the
 * entry point, so Enter on the Checks button never lands on a control that closes the panel again.
 */
export function focusChecksPanel(): void {
  const panel = document.getElementById('checks-panel')
  if (!panel) return
  const first = panel.querySelector<HTMLElement>(
    '.checks-panel-body summary, .checks-panel-body button:not(:disabled)'
  )
  ;(first ?? panel).focus()
}

/** Set when the Checks button is activated from the keyboard; the panel consumes it once it has mounted. */
let focusPanelOnOpen = false
/** Enter / Space pressed on the Checks button (cleared by any pointer press). */
let keyboardActivation = false

/**
 * Top-bar Checks (B4): opens the Checks panel on the left. The button reads its state with an icon, a tone and
 * counts: errors and items that need attention are counted separately; Good to know notes are never counted as
 * problems, so a project with only notes shows the green Ready check.
 */
export function ChecksButton(): React.JSX.Element | null {
  const checks = useProjectChecks()
  const open = useLayout((s) => s.checksOpen)
  if (!checks) return null
  const state = checksButtonState(checks)
  const Icon = TONE_ICON[state.tone]
  return (
    <Tooltip label={`Checks · ${checks.headline.text}`} {...tipProps('checks')}>
      <button
        type="button"
        id="checks-button"
        className={`ui-btn ghost checks-btn tone-${state.tone}${open ? ' open' : ''}`}
        aria-expanded={open}
        aria-controls={open ? 'checks-panel' : undefined}
        aria-label={`Checks: ${checks.headline.text}`}
        data-state={state.text}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') keyboardActivation = true
        }}
        onPointerDown={() => {
          keyboardActivation = false
        }}
        onClick={(e) => {
          // Opened from the keyboard (Enter / Space, or an assistive-technology click with no pointer click count):
          // focus moves into the panel once it has mounted, so Tab continues there. A mouse click leaves focus on
          // the button.
          const fromKeyboard = keyboardActivation || e.detail === 0
          keyboardActivation = false
          focusPanelOnOpen = !open && fromKeyboard
          layoutStore.getState().setChecksOpen(!open)
        }}
      >
        <Icon size={16} strokeWidth={1.9} aria-hidden="true" className="checks-icon" />
        <span className="label">Checks</span>
        {checks.errors > 0 && (
          <span className="ui-count tone-error" aria-hidden="true" data-count="error">
            {checks.errors}
          </span>
        )}
        {checks.warnings > 0 && (
          <span className="ui-count tone-attention" aria-hidden="true" data-count="attention">
            {checks.warnings}
          </span>
        )}
      </button>
    </Tooltip>
  )
}

/** Checks panel width (CSS px before the interface scale): wide enough for a card with two actions. */
export const CHECKS_PANEL_WIDTH = 320

/**
 * The Checks panel (B1 mockup 07): the left zone (where tool drawers open), so Properties stays visible while a
 * selected layer is fixed. Docked on roomy windows, floating over the canvas on narrower ones. The header stays put
 * and the body scrolls, so no action is lost below the status bar at short window heights. It stays open while the
 * user selects and edits layers; it closes on its Close button, the Checks button, Escape or a rail category.
 */
export function ChecksPanel({ mode }: { mode: DrawerMode }): React.JSX.Element | null {
  const open = useLayout((s) => s.checksOpen)
  const checks = useProjectChecks()
  const shown = open && checks !== null
  useEffect(() => {
    if (shown && focusPanelOnOpen) {
      focusPanelOnOpen = false
      focusChecksPanel()
    }
  }, [shown])
  if (!shown) return null
  return (
    <aside
      id="checks-panel"
      className={`tooldrawer checks-panel ${mode}`}
      aria-label="Checks"
      // Focusable (not a Tab stop): a click on the heading, text or blank space keeps focus in the panel, so Escape
      // still knows the panel owns focus; it is also the keyboard entry point when there is no action to land on.
      tabIndex={-1}
      data-editor-panel
      data-region="drawer"
      data-mode={mode}
      style={{ width: `calc(${CHECKS_PANEL_WIDTH}px * var(--ui-scale))` }}
    >
      <header className="drawer-header">
        <h2 className="drawer-title">Checks</h2>
        <IconButton
          size="sm"
          icon={X}
          label="Close"
          hint="Close the Checks panel"
          onClick={closeChecksReturningFocus}
        />
      </header>
      <div className="checks-panel-summary" id="checks-summary" role="status">
        <CheckCounts model={checks} />
      </div>
      <div className="drawer-body checks-panel-body">
        <CheckGroups model={checks} emptyText="Ready. Nothing needs fixing." />
        <p className="drawer-note">Export checks again for the files you choose.</p>
      </div>
    </aside>
  )
}
