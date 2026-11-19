import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  appearanceAttributes,
  loadAppearancePrefs,
  resolveTheme,
  saveAppearancePrefs,
  type AppearancePrefs,
  type Density,
  type ResolvedTheme,
  type ThemePref,
  type UiScale,
  isDensity,
  isThemePref,
  isUiScale
} from '@editor/appearance'
import { heightTier, widthTier } from '@editor/responsive'

/**
 * App-level appearance (Phase 7B B2, ADR-055): theme, density, interface scale, getting-started tips. A setting of
 * THIS COMPUTER kept in the app's browser storage next to the Output Profile choice (ADR-053). It is a separate store
 * from the editor: nothing here touches the project, history, autosave or exports, and changing it never marks a
 * project Modified. Applied as attributes on <html>, which the semantic tokens key off; switching is live (no restart).
 */
interface AppearanceState extends AppearancePrefs {
  /** The operating system currently prefers dark (only matters for theme = "system"). */
  systemDark: boolean
  setTheme(theme: ThemePref): void
  setDensity(density: Density): void
  setUiScale(scale: UiScale): void
  setShowGettingStartedTips(show: boolean): void
}

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const darkQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export const appearanceStore = createStore<AppearanceState>((set) => ({
  ...loadAppearancePrefs(storage()),
  systemDark: darkQuery()?.matches ?? false,
  setTheme: (theme) => {
    if (isThemePref(theme)) set({ theme })
  },
  setDensity: (density) => {
    if (isDensity(density)) set({ density })
  },
  setUiScale: (uiScale) => {
    if (isUiScale(uiScale)) set({ uiScale })
  },
  setShowGettingStartedTips: (show) => set({ showGettingStartedTips: show === true })
}))

export const useAppearance = <T>(selector: (s: AppearanceState) => T): T =>
  useStore(appearanceStore, selector)

export const prefsOf = (s: AppearancePrefs): AppearancePrefs => ({
  theme: s.theme,
  density: s.density,
  uiScale: s.uiScale,
  showGettingStartedTips: s.showGettingStartedTips
})

export const resolvedTheme = (s: AppearanceState = appearanceStore.getState()): ResolvedTheme =>
  resolveTheme(s.theme, s.systemDark)

/** Writes the current appearance onto the document root. Pure DOM; safe to call repeatedly. */
export function applyAppearance(root: HTMLElement = document.documentElement): void {
  const s = appearanceStore.getState()
  const a = appearanceAttributes(prefsOf(s), s.systemDark)
  root.setAttribute('data-theme', a['data-theme'])
  root.setAttribute('data-theme-pref', a['data-theme-pref'])
  root.setAttribute('data-density', a['data-density'])
  root.style.setProperty('--ui-scale', a.uiScale)
}

/** Publishes the responsive tiers (`data-width-tier`, `data-height-tier`) for CSS and components. */
export function applyResponsiveTiers(root: HTMLElement = document.documentElement): void {
  root.setAttribute('data-width-tier', widthTier(window.innerWidth))
  root.setAttribute('data-height-tier', heightTier(window.innerHeight))
}

/** Asks main to make the native chrome follow the theme; for "system" it also reports the OS's real setting. */
function syncNativeTheme(theme: ThemePref): void {
  const bridge = window.api?.appearance
  if (!bridge) return
  bridge
    .setNativeTheme({ source: theme })
    .then((osTheme) => {
      if (theme === 'system' && appearanceStore.getState().theme === 'system')
        appearanceStore.setState({ systemDark: osTheme === 'dark' })
    })
    .catch(() => {
      // Native chrome keeps its previous look; the app itself is already themed.
    })
}

let started = false
/**
 * Applies the stored appearance before the first render and keeps it applied: persists every change, follows the OS
 * live while "Match system" is chosen, and keeps the responsive tiers current. Idempotent.
 */
export function startAppearance(): void {
  if (started) return
  started = true
  applyAppearance()
  applyResponsiveTiers()
  syncNativeTheme(appearanceStore.getState().theme)

  appearanceStore.subscribe((s, prev) => {
    applyAppearance()
    const changed =
      s.theme !== prev.theme ||
      s.density !== prev.density ||
      s.uiScale !== prev.uiScale ||
      s.showGettingStartedTips !== prev.showGettingStartedTips
    if (changed) saveAppearancePrefs(storage(), prefsOf(s))
    if (s.theme !== prev.theme) syncNativeTheme(s.theme)
  })

  darkQuery()?.addEventListener('change', (e) => {
    appearanceStore.setState({ systemDark: e.matches })
  })
  window.addEventListener('resize', () => applyResponsiveTiers())
}
