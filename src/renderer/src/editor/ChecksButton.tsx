import { X } from 'lucide-react'
import { checksButtonState } from '@editor/checks'
import type { DrawerMode } from '@editor/layout'
import { CheckCounts, CheckGroups, TONE_ICON, useProjectChecks } from './CheckList'
import { tipProps } from './tips'
import { layoutStore, useLayout } from './layoutStore'
import { IconButton } from '../ui/IconButton'
import { Tooltip } from '../ui/Tooltip'
import { restoreFocus } from '../ui/restoreFocus'

/**
 * Closes the Checks panel. When keyboard focus was inside it, focus goes back to the top-bar Checks button (never
 * stranded on the page), using programmatic focus restoration so no stale tooltip appears.
 */
export function closeChecksReturningFocus(): void {
  const inside = document.activeElement?.closest('#checks-panel') != null
  layoutStore.getState().setChecksOpen(false)
  if (inside) restoreFocus(document.getElementById('checks-button'))
}

/** Focus the Checks panel's first control (its first group, else its Close button). */
export function focusChecksPanel(): void {
  document
    .querySelector<HTMLElement>(
      '#checks-panel .check-groups summary, #checks-panel .drawer-header button'
    )
    ?.focus()
}

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
        onClick={(e) => {
          layoutStore.getState().setChecksOpen(!open)
          // Opened from the keyboard (Enter / Space: no pointer click count): move focus into the panel so Tab
          // continues there. A mouse click leaves focus where it is.
          if (!open && e.detail === 0) requestAnimationFrame(focusChecksPanel)
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
  if (!open || !checks) return null
  return (
    <aside
      id="checks-panel"
      className={`tooldrawer checks-panel ${mode}`}
      aria-label="Checks"
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
