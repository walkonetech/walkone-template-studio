/**
 * Pure rules for the editor's UI layout (panel sizes, which panels start open). UI-only state: none of it is part of
 * the project, none of it marks the project Modified, and none of it is persisted yet.
 */

export const SIDEBAR_MIN = 280
export const SIDEBAR_MAX = 520
export const SIDEBAR_DEFAULT = 320
export const LAYERS_SPLIT_MIN = 0.22
export const LAYERS_SPLIT_MAX = 0.7
export const LAYERS_SPLIT_DEFAULT = 0.4
/** Window width below which the tool drawer starts collapsed so the canvas keeps its room. */
export const DRAWER_AUTO_COLLAPSE_BELOW = 1360
export const DRAWER_WIDTH = 224
export const RAIL_WIDTH = 64
/** Never let the side panels take more than this share of the window, whatever the stored size. */
export const MAX_PANEL_SHARE = 0.45

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function clampSidebarWidth(width: number, windowWidth = Infinity): number {
  const cap = Number.isFinite(windowWidth)
    ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth * MAX_PANEL_SHARE)))
    : SIDEBAR_MAX
  return Math.round(clamp(Number.isFinite(width) ? width : SIDEBAR_DEFAULT, SIDEBAR_MIN, cap))
}

export function clampLayersSplit(fraction: number): number {
  return clamp(
    Number.isFinite(fraction) ? fraction : LAYERS_SPLIT_DEFAULT,
    LAYERS_SPLIT_MIN,
    LAYERS_SPLIT_MAX
  )
}

export const drawerStartsOpen = (windowWidth: number): boolean =>
  windowWidth >= DRAWER_AUTO_COLLAPSE_BELOW

/** Width left for the canvas workspace; used to document and test that the minimum window still leaves room. */
export function workspaceWidth(
  windowWidth: number,
  opts: { drawerOpen: boolean; sidebarWidth: number; hasProject: boolean }
): number {
  const left = RAIL_WIDTH + (opts.drawerOpen ? DRAWER_WIDTH : 0)
  const right = opts.hasProject ? clampSidebarWidth(opts.sidebarWidth, windowWidth) : 0
  return Math.max(0, windowWidth - left - right)
}

/** Below this canvas width an open tool drawer is closed automatically when the window shrinks. */
export const MIN_WORKSPACE = 520

/**
 * Observed in Phase 4D: shrinking the window with the drawer open left the canvas under 500 px at the minimum size.
 * The drawer then collapses (the user can reopen it); it never reopens by itself, and growing the window does nothing.
 */
export const shouldAutoCollapseDrawer = (
  windowWidth: number,
  drawerOpen: boolean,
  sidebarWidth: number
): boolean =>
  drawerOpen &&
  workspaceWidth(windowWidth, { drawerOpen, sidebarWidth, hasProject: true }) < MIN_WORKSPACE
