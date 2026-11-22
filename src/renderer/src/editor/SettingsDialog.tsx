import { Monitor, Moon, Printer, SlidersHorizontal, Sun, SunMedium } from 'lucide-react'
import {
  DENSITY_LABELS,
  UI_SCALES,
  uiScaleLabel,
  type Density,
  type ThemePref,
  type UiScale
} from '@editor/appearance'
import { printerView } from '@output'
import { selectOutputProfile } from '@editor/store'
import { appearanceStore, useAppearance } from '../appearance/appearanceStore'
import { layoutStore, useLayout, type SettingsPage } from './layoutStore'
import { useEditor } from './editorStore'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Controls'

const PAGES: readonly { id: SettingsPage; label: string; icon: typeof Sun }[] = [
  { id: 'appearance', label: 'Appearance', icon: SunMedium },
  { id: 'printing', label: 'Printing', icon: Printer },
  { id: 'editor', label: 'Editor', icon: SlidersHorizontal }
]

const THEMES: readonly { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor }
]

/** Theme as three picture cards (B1 mockup 12a): a radio group, arrow keys move and choose. */
function ThemeCards(): React.JSX.Element {
  const theme = useAppearance((s) => s.theme)
  const set = (t: ThemePref): void => appearanceStore.getState().setTheme(t)
  return (
    <div
      className="theme-cards"
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={(e) => {
        const d =
          e.key === 'ArrowRight' || e.key === 'ArrowDown'
            ? 1
            : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
              ? -1
              : 0
        if (!d) return
        e.preventDefault()
        const i = THEMES.findIndex((t) => t.value === theme)
        const next = THEMES[(i + d + THEMES.length) % THEMES.length]!
        set(next.value)
        requestAnimationFrame(() =>
          document
            .querySelector<HTMLElement>(`.theme-card[data-theme-card="${next.value}"]`)
            ?.focus()
        )
      }}
    >
      {THEMES.map((t) => (
        <button
          key={t.value}
          type="button"
          role="radio"
          aria-checked={theme === t.value}
          tabIndex={theme === t.value ? 0 : -1}
          className="theme-card"
          data-theme-card={t.value}
          onClick={() => set(t.value)}
        >
          <span className={`theme-pic ${t.value}`} aria-hidden="true">
            <span className="pic-bar" />
            <span className="pic-paper" />
          </span>
          <span className="theme-label">
            <span className="radio-dot" aria-hidden="true" />
            <t.icon size={14} aria-hidden="true" />
            {t.label}
            {t.value === 'light' ? ' · default' : ''}
          </span>
        </button>
      ))}
    </div>
  )
}

function AppearancePage(): React.JSX.Element {
  const density = useAppearance((s) => s.density)
  const uiScale = useAppearance((s) => s.uiScale)
  const a = appearanceStore.getState
  return (
    <div className="settings-page" data-page="appearance">
      <h3 className="settings-heading">Theme</h3>
      <ThemeCards />
      <p className="settings-note">
        Your designs look the same in every theme. Only the space around them changes.
      </p>
      <h3 className="settings-heading">Button and text size</h3>
      <Segmented<Density>
        label="Button and text size"
        value={density}
        options={[
          { value: 'comfortable', label: `${DENSITY_LABELS.comfortable} · default` },
          { value: 'compact', label: DENSITY_LABELS.compact }
        ]}
        onChange={(d) => a().setDensity(d)}
      />
      <p className="settings-note">
        Comfortable has larger buttons and text. Compact fits more on screen for experienced users.
      </p>
      <h3 className="settings-heading">Interface scale</h3>
      <Segmented<UiScale>
        label="Interface scale"
        value={uiScale}
        options={UI_SCALES.map((s) => ({ value: s, label: uiScaleLabel(s) }))}
        onChange={(s) => a().setUiScale(s)}
      />
      <p className="settings-note">
        Makes panels and text larger or smaller. Canvas zoom is separate. Windows display scaling
        still applies.
      </p>
    </div>
  )
}

function PrintingPage(): React.JSX.Element {
  const profile = useEditor(selectOutputProfile)
  const pv = profile ? printerView(profile) : null
  return (
    <div className="settings-page" data-page="printing">
      <h3 className="settings-heading">Printing</h3>
      <div className="settings-row">
        <span className="settings-row-text">
          <span className="settings-row-title">Printer for this computer</span>
          <span className="settings-row-sub">
            Used for safe areas and printer checks in every project on this computer.
          </span>
        </span>
        <span className="settings-row-value" data-testid="settings-printer">
          {profile && pv ? `${profile.shortName} · ${pv.readiness.label}` : 'No printer chosen'}
        </span>
      </div>
      <div className="settings-row">
        <span className="settings-row-text">
          <span className="settings-row-title">Printer &amp; cutting</span>
          <span className="settings-row-sub">
            Choose the printer, see where it cuts and how sure we are.
          </span>
        </span>
        <Button
          size="sm"
          onClick={() => {
            const l = layoutStore.getState()
            l.setSettingsPage(null)
            l.setOutputProfileOpen(true)
          }}
        >
          Open…
        </Button>
      </div>
    </div>
  )
}

function EditorPage(): React.JSX.Element {
  const toolbar = useAppearance((s) => s.showSelectionToolbar)
  const tips = useAppearance((s) => s.showGettingStartedTips)
  const a = appearanceStore.getState
  return (
    <div className="settings-page" data-page="editor">
      <h3 className="settings-heading">Editor</h3>
      <div className="settings-row">
        <span className="settings-row-text">
          <span className="settings-row-title">Selection toolbar</span>
          <span className="settings-row-sub">Quick actions next to the selected layer.</span>
        </span>
        <Switch
          label="Selection toolbar"
          checked={toolbar}
          onChange={(v) => a().setShowSelectionToolbar(v)}
        />
      </div>
      <div className="settings-row">
        <span className="settings-row-text">
          <span className="settings-row-title">
            Show getting-started tips for new blank projects
          </span>
          <span className="settings-row-sub">
            Three short steps beside the canvas. Turn them back on here after hiding them.
          </span>
        </span>
        <Switch
          label="Show getting-started tips for new blank projects"
          checked={tips}
          onChange={(v) => a().setShowGettingStartedTips(v)}
        />
      </div>
    </div>
  )
}

/**
 * Settings (Phase 7B B5, B1 mockups 12a/12b): settings of THIS COMPUTER, never stored in a project. Changes apply
 * right away (the appearance store persists them); nothing here touches the open project, its history or its exports.
 * Opened from File › Settings… (Ctrl+, / ⌘,) and the Start screen.
 */
export function SettingsDialog(): React.JSX.Element | null {
  const page = useLayout((s) => s.settingsPage)
  if (!page) return null
  const close = (): void => layoutStore.getState().setSettingsPage(null)
  return (
    <Dialog
      title="Settings"
      description="Settings for this computer. They are never stored in a project."
      size="lg"
      testId="settings-dialog"
      onEscape={close}
      footer={
        <DialogActions
          start={<span className="footer-note">Changes apply right away.</span>}
          primary={
            <Button variant="primary" onClick={close} id="settings-done">
              Done
            </Button>
          }
        />
      }
    >
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings pages">
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className="settings-nav-item"
              aria-current={page === p.id ? 'page' : undefined}
              data-page={p.id}
              onClick={() => layoutStore.getState().setSettingsPage(p.id)}
            >
              <p.icon size={16} aria-hidden="true" />
              {p.label}
            </button>
          ))}
        </nav>
        {page === 'appearance' && <AppearancePage />}
        {page === 'printing' && <PrintingPage />}
        {page === 'editor' && <EditorPage />}
      </div>
    </Dialog>
  )
}
