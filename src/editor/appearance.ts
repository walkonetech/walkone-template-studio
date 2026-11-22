/**
 * Application appearance preferences (Phase 7B B2, ADR-055): theme, density, interface scale and the getting-started
 * tips switch. They are settings of THIS COMPUTER, like the selected Output Profile (ADR-053): never part of
 * `TemplateProject`, never written to a `.boothproject`, never exported, never in undo history, and changing one never
 * marks a project Modified. Pure rules only; the renderer stores them (`appearanceStore.ts`) and applies them as
 * attributes on the document root, which the semantic design tokens (`styles/tokens.css`) key off.
 */

export const THEME_PREFS = ['light', 'dark', 'system'] as const
export type ThemePref = (typeof THEME_PREFS)[number]
/** The theme actually drawn: `system` resolves to one of these from the operating system's setting. */
export type ResolvedTheme = 'light' | 'dark'

export const DENSITIES = ['comfortable', 'compact'] as const
export type Density = (typeof DENSITIES)[number]

/**
 * Interface scale: the size of the app's own chrome (text, controls, panels). It is NOT the operating system's
 * display scaling (Windows 125 %, Retina) and NOT the canvas zoom; it never changes design geometry.
 */
export const UI_SCALES = [0.9, 1, 1.1, 1.25] as const
export type UiScale = (typeof UI_SCALES)[number]

export interface AppearancePrefs {
  theme: ThemePref
  density: Density
  uiScale: UiScale
  /** Show the getting-started tips on each new blank project until the user chooses "Hide these tips" (B1 R3). */
  showGettingStartedTips: boolean
  /** Show the contextual selection toolbar over the canvas (B1 D9: it can be turned off in Settings › Editor). */
  showSelectionToolbar: boolean
}

/** B1 sign-off: Light, Comfortable, 100 %, tips on, selection toolbar on. */
export const DEFAULT_APPEARANCE: Readonly<AppearancePrefs> = Object.freeze({
  theme: 'light',
  density: 'comfortable',
  uiScale: 1,
  showGettingStartedTips: true,
  showSelectionToolbar: true
})

/** Browser-storage key in the renderer (versioned so a later shape can migrate). */
export const APPEARANCE_STORAGE_KEY = 'walkone.appearance.v1'

export const isThemePref = (v: unknown): v is ThemePref =>
  typeof v === 'string' && (THEME_PREFS as readonly string[]).includes(v)
export const isDensity = (v: unknown): v is Density =>
  typeof v === 'string' && (DENSITIES as readonly string[]).includes(v)
export const isUiScale = (v: unknown): v is UiScale =>
  typeof v === 'number' && (UI_SCALES as readonly number[]).includes(v)

/**
 * Reads stored preferences field by field: anything missing, unknown or malformed falls back to its default, so a
 * damaged or older entry can never stop the app from starting or switch the user to an unexpected look.
 */
export function parseAppearancePrefs(raw: unknown): AppearancePrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    theme: isThemePref(o['theme']) ? o['theme'] : DEFAULT_APPEARANCE.theme,
    density: isDensity(o['density']) ? o['density'] : DEFAULT_APPEARANCE.density,
    uiScale: isUiScale(o['uiScale']) ? o['uiScale'] : DEFAULT_APPEARANCE.uiScale,
    showGettingStartedTips:
      typeof o['showGettingStartedTips'] === 'boolean'
        ? o['showGettingStartedTips']
        : DEFAULT_APPEARANCE.showGettingStartedTips,
    showSelectionToolbar:
      typeof o['showSelectionToolbar'] === 'boolean'
        ? o['showSelectionToolbar']
        : DEFAULT_APPEARANCE.showSelectionToolbar
  }
}

/** The JSON text the renderer stores. */
export const serializeAppearancePrefs = (p: AppearancePrefs): string =>
  JSON.stringify(parseAppearancePrefs(p))

/** Minimal storage surface (window.localStorage in the app; a map in tests). */
export interface PrefStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Loads the stored preferences; unreadable or unavailable storage gives the defaults. */
export function loadAppearancePrefs(storage: PrefStorage | null | undefined): AppearancePrefs {
  try {
    const text = storage?.getItem(APPEARANCE_STORAGE_KEY)
    return parseAppearancePrefs(text ? JSON.parse(text) : null)
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** Stores the preferences; returns false when storage is unavailable (the choice then lasts for this run only). */
export function saveAppearancePrefs(
  storage: PrefStorage | null | undefined,
  prefs: AppearancePrefs
): boolean {
  try {
    if (!storage) return false
    storage.setItem(APPEARANCE_STORAGE_KEY, serializeAppearancePrefs(prefs))
    return true
  } catch {
    return false
  }
}

/** Which theme to draw. `systemPrefersDark` is the OS setting (`prefers-color-scheme: dark`). */
export const resolveTheme = (pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme =>
  pref === 'system' ? (systemPrefersDark ? 'dark' : 'light') : pref

/**
 * The root-element attributes the tokens key off. `data-theme` is always the RESOLVED theme (CSS never needs to know
 * about "system"); `data-theme-pref` keeps the choice for diagnostics and validation.
 */
export function appearanceAttributes(
  prefs: AppearancePrefs,
  systemPrefersDark: boolean
): {
  'data-theme': ResolvedTheme
  'data-theme-pref': ThemePref
  'data-density': Density
  uiScale: string
} {
  return {
    'data-theme': resolveTheme(prefs.theme, systemPrefersDark),
    'data-theme-pref': prefs.theme,
    'data-density': prefs.density,
    uiScale: String(prefs.uiScale)
  }
}

export { WINDOW_BACKGROUND } from '@shared/appearance'

export const THEME_LABELS: Readonly<Record<ThemePref, string>> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match system'
}
export const DENSITY_LABELS: Readonly<Record<Density, string>> = {
  comfortable: 'Comfortable',
  compact: 'Compact'
}
export const uiScaleLabel = (s: UiScale): string => `${Math.round(s * 100)} %`
