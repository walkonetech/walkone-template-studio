/**
 * Pure rules for the editor shell's UI layout (Phase 7B B3, from the approved B1 mockups and PHASE_7A_UX_ARCHITECTURE):
 * panel sizes, when the tool drawer docks or floats, when Properties and Layers stack or become tabs, how the top bar
 * shortens, the Escape order and the F6 region order.
 *
 * All of it is UI state of this computer: none of it is part of the project, none of it marks the project Modified,
 * and none of it enters undo history or autosave. Panel sizes are remembered on this computer (localStorage).
 */
import type { Density } from './appearance'
import { drawerMayDock, usesPanelTabs, widthTier, type WidthTier } from './responsive'

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

// ---- right column (Properties + Layers) ------------------------------------------------------------------------
export const SIDEBAR_MIN = 280
export const SIDEBAR_MAX = 520
/** B1: ~340 px on roomy windows, ~300 px on the 1280–1599 tier, 280 px below. */
export const SIDEBAR_BY_TIER: Readonly<Record<WidthTier, number>> = {
  wide: 340,
  medium: 300,
  narrow: 280
}
/** Kept for callers that need one number (the medium-tier width). */
export const SIDEBAR_DEFAULT = SIDEBAR_BY_TIER.medium
export const defaultSidebarWidth = (windowWidth: number): number =>
  SIDEBAR_BY_TIER[widthTier(windowWidth)]

/** Share of the stacked right column given to LAYERS (the lower pane; Properties sits above it, B1). */
export const LAYERS_SPLIT_MIN = 0.22
export const LAYERS_SPLIT_MAX = 0.7
export const LAYERS_SPLIT_DEFAULT = 0.45
/** Never let the side panels take more than this share of the window, whatever the stored size. */
export const MAX_PANEL_SHARE = 0.45

export function clampSidebarWidth(width: number, windowWidth = Infinity): number {
  const cap = Number.isFinite(windowWidth)
    ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth * MAX_PANEL_SHARE)))
    : SIDEBAR_MAX
  const fallback = Number.isFinite(windowWidth) ? defaultSidebarWidth(windowWidth) : SIDEBAR_DEFAULT
  return Math.round(clamp(Number.isFinite(width) ? width : fallback, SIDEBAR_MIN, cap))
}

/** The right column's width: the user's own width when they resized it, else the width for this window tier. */
export const sidebarWidthFor = (stored: number | null, windowWidth: number): number =>
  clampSidebarWidth(stored ?? defaultSidebarWidth(windowWidth), windowWidth)

export function clampLayersSplit(fraction: number): number {
  return clamp(
    Number.isFinite(fraction) ? fraction : LAYERS_SPLIT_DEFAULT,
    LAYERS_SPLIT_MIN,
    LAYERS_SPLIT_MAX
  )
}

export type RightColumnLayout = 'stacked' | 'tabs'
export type RightTab = 'properties' | 'layers'
/** ≥ 860 CSS px tall: Properties above Layers with a splitter; shorter: Properties | Layers tabs (B1 R2). */
export const rightColumnLayout = (windowHeight: number): RightColumnLayout =>
  usesPanelTabs(windowHeight) ? 'tabs' : 'stacked'

// ---- rail + tool drawer -------------------------------------------------------------------------------------------
/** The labelled rail at Comfortable density (B1); Compact is 64. The CSS reads the same numbers from tokens. */
export const RAIL_WIDTH = 80
export const RAIL_WIDTH_COMPACT = 64
export const railWidth = (density: Density): number =>
  density === 'compact' ? RAIL_WIDTH_COMPACT : RAIL_WIDTH

export const DRAWER_WIDTH_DEFAULT = 264
export const DRAWER_WIDTH_MIN = 240
export const DRAWER_WIDTH_MAX = 360
export const clampDrawerWidth = (px: number): number =>
  Math.round(
    clamp(Number.isFinite(px) ? px : DRAWER_WIDTH_DEFAULT, DRAWER_WIDTH_MIN, DRAWER_WIDTH_MAX)
  )

export type DrawerMode = 'docked' | 'floating'
/**
 * ≥ 1600 CSS px: the drawer docks beside the canvas and takes its own column. Narrower: it floats over the canvas,
 * anchored beside the rail, stays open while several things are added, and closes on a canvas click, on another rail
 * category, on its Close button or on Escape.
 */
export const drawerMode = (windowWidth: number): DrawerMode =>
  drawerMayDock(windowWidth) ? 'docked' : 'floating'

/** The drawer starts open only where it docks; a floating drawer opens when a rail category is chosen. */
export const drawerStartsOpen = (windowWidth: number): boolean =>
  drawerMode(windowWidth) === 'docked'

/** Only a FLOATING drawer closes when the canvas is clicked (a docked one is part of the layout). */
export const drawerClosesOnCanvasClick = (mode: DrawerMode): boolean => mode === 'floating'

/** Width left for the canvas workspace (a floating drawer covers the canvas instead of taking width). */
export function workspaceWidth(
  windowWidth: number,
  opts: {
    drawerOpen: boolean
    sidebarWidth: number
    hasProject: boolean
    drawerWidth?: number
    density?: Density
  }
): number {
  const docked = opts.drawerOpen && drawerMode(windowWidth) === 'docked'
  const left =
    railWidth(opts.density ?? 'comfortable') +
    (docked ? clampDrawerWidth(opts.drawerWidth ?? DRAWER_WIDTH_DEFAULT) : 0)
  const right = opts.hasProject ? clampSidebarWidth(opts.sidebarWidth, windowWidth) : 0
  return Math.max(0, windowWidth - left - right)
}

/** The minimum useful canvas width (B1 sign-off: 520 × 400 CSS px). */
export const MIN_WORKSPACE = 520

/**
 * A DOCKED drawer is closed automatically when the window shrinks so far that the canvas would drop below the minimum
 * (observed in Phase 4D). It never reopens by itself; growing the window does nothing.
 */
export const shouldAutoCollapseDrawer = (
  windowWidth: number,
  drawerOpen: boolean,
  sidebarWidth: number,
  drawerWidth = DRAWER_WIDTH_DEFAULT
): boolean =>
  drawerOpen &&
  drawerMode(windowWidth) === 'docked' &&
  workspaceWidth(windowWidth, { drawerOpen, sidebarWidth, hasProject: true, drawerWidth }) <
    MIN_WORKSPACE

/**
 * Crossing from the docked tier to the floating tier closes an open drawer (it would otherwise suddenly cover the
 * canvas); crossing the other way leaves it as it is.
 */
export const closeDrawerOnTierChange = (
  before: number,
  after: number,
  drawerOpen: boolean
): boolean => drawerOpen && drawerMode(before) === 'docked' && drawerMode(after) === 'floating'

// ---- top bar ------------------------------------------------------------------------------------------------------
export interface TopBarPresentation {
  /** Undo / Redo show their word next to the icon (Comfortable, not narrow); otherwise icon-only with a tooltip. */
  undoRedoWords: boolean
  /** "See how it prints" while there is room, "Preview" (eye icon) on narrow windows; never icon-only. */
  previewLabel: 'See how it prints' | 'Preview'
  /** Checks keeps its word at every size; only its count badge is extra. */
  checksWord: true
  /** Export is the primary action and is shown at every supported size. */
  exportVisible: true
}

/**
 * Responsive priority when the window narrows (most protected first): Export, Save + project state, Preview, Checks,
 * Undo/Redo, then menu spacing and the document title width (which ellipsizes first).
 */
export function topBarPresentation(windowWidth: number, density: Density): TopBarPresentation {
  const tier = widthTier(windowWidth)
  return {
    undoRedoWords: density === 'comfortable' && tier !== 'narrow',
    previewLabel: tier === 'narrow' ? 'Preview' : 'See how it prints',
    checksWord: true,
    exportVisible: true
  }
}

// ---- Escape and F6 ------------------------------------------------------------------------------------------------
export type EscapeTarget = 'popover' | 'floating-drawer' | 'selection' | null

/**
 * One Escape press closes or ends exactly one thing, in this order (7A): popover/menu, floating drawer, selection.
 * (7A also listed Reposition mode between drawer and selection; that mode went with Sample Photos in B3.1. Text
 * editing owns its own Escape inside the text editor.)
 */
export function escapeTarget(s: {
  popoverOpen: boolean
  floatingDrawerOpen: boolean
  hasSelection: boolean
}): EscapeTarget {
  if (s.popoverOpen) return 'popover'
  if (s.floatingDrawerOpen) return 'floating-drawer'
  if (s.hasSelection) return 'selection'
  return null
}

/**
 * When a non-modal panel (the Checks panel) closes, does focus go back to its trigger? Yes when the panel owned focus:
 * focus inside it (a control, or the focusable panel itself after a click on its heading, text or blank space), or
 * focus stranded on the page with nothing focused. No when the user moved focus to another control on purpose: that
 * control keeps it (B4.1).
 */
export const panelReturnsFocus = (s: { focusInPanel: boolean; focusOnPage: boolean }): boolean =>
  s.focusInPanel || s.focusOnPage

/** F6 / Shift+F6 cycle through these landmarks, skipping the ones not on screen (7A). */
export const REGION_ORDER = [
  'topbar',
  'rail',
  'drawer',
  'viewbar',
  'canvas',
  'sidebar',
  'statusbar'
] as const
export type RegionId = (typeof REGION_ORDER)[number]

export function nextRegion(
  current: RegionId | null,
  available: readonly RegionId[],
  backwards = false
): RegionId | null {
  const order = REGION_ORDER.filter((r) => available.includes(r))
  if (order.length === 0) return null
  const i = current ? order.indexOf(current) : -1
  if (i < 0) return backwards ? (order[order.length - 1] ?? null) : (order[0] ?? null)
  return order[(i + (backwards ? -1 : 1) + order.length) % order.length] ?? null
}

// ---- canvas-state bar ---------------------------------------------------------------------------------------------
/**
 * The canvas-state bar holds VIEW controls only. The rule (B1 sign-off): if a control changes how the canvas is
 * viewed, it may belong here; if it changes the design itself, it does not.
 */
export const CANVAS_STATE_CONTROLS = ['mode', 'safeAreas', 'overflow'] as const

/**
 * The tool drawer while the workspace changes mode (B3.1). Print Preview is read only, so entering it closes the
 * creation drawer (floating or docked) instead of leaving Add buttons that do nothing; going back to Design never
 * reopens it by itself.
 */
export function drawerOpenAfterModeChange(
  before: 'design' | 'preview',
  after: 'design' | 'preview',
  open: boolean
): boolean {
  if (after === 'preview' && before !== 'preview') return false
  return open
}

export function safeAreasControl(
  hasProfile: boolean,
  show: boolean
): { value: 'On' | 'Off' | 'No profile'; pressed: boolean; disabled: boolean } {
  if (!hasProfile) return { value: 'No profile', pressed: false, disabled: true }
  return { value: show ? 'On' : 'Off', pressed: show, disabled: false }
}

// ---- remembered layout (this computer only) -----------------------------------------------------------------------
export interface LayoutPrefs {
  drawerWidth: number
  layersSplit: number
  /** null = follow the window tier (the user has not resized the column). */
  sidebarWidth: number | null
  rightTab: RightTab
}

export const DEFAULT_LAYOUT_PREFS: Readonly<LayoutPrefs> = Object.freeze({
  drawerWidth: DRAWER_WIDTH_DEFAULT,
  layersSplit: LAYERS_SPLIT_DEFAULT,
  sidebarWidth: null,
  rightTab: 'properties'
})
export const LAYOUT_STORAGE_KEY = 'walkone.layout.v1'

/** Field-by-field: anything missing or invalid falls back to its default; nothing here can fail. */
export function parseLayoutPrefs(raw: unknown): LayoutPrefs {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const dw = num(o['drawerWidth'])
  const ls = num(o['layersSplit'])
  const sw = num(o['sidebarWidth'])
  return {
    drawerWidth: dw === null ? DRAWER_WIDTH_DEFAULT : clampDrawerWidth(dw),
    layersSplit: ls === null ? LAYERS_SPLIT_DEFAULT : clampLayersSplit(ls),
    sidebarWidth: sw === null ? null : clampSidebarWidth(sw),
    rightTab: o['rightTab'] === 'layers' ? 'layers' : 'properties'
  }
}

// ---- which keys a focused control keeps for itself ------------------------------------------------------------------
/**
 * Whether a key pressed while `target` has focus belongs to that control rather than to the window's shortcuts.
 * Menus and dialogs own every key (Escape included). Splitters (arrows resize) and radio groups own their keys but
 * have no use for Escape, so Escape still follows the window's dismissal order from there: right after dragging the
 * floating drawer's resize grip, Escape closes the drawer (B3.1). Text entry owns every key.
 */
export function controlOwnsKey(
  target: { role: 'menu' | 'dialog' | 'separator' | 'radiogroup' | null; textEntry: boolean },
  key: string
): boolean {
  if (target.role === 'menu' || target.role === 'dialog') return true
  if (target.role === 'separator' || target.role === 'radiogroup') return key !== 'Escape'
  return target.textEntry
}
