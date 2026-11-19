/**
 * Responsive foundation for the editor shell (Phase 7B B2; tiers from docs/PHASE_7A_UX_ARCHITECTURE.md and the B1
 * mockups). Pure rules: the renderer publishes the current tiers as `data-width-tier` / `data-height-tier` on the
 * document root so CSS and components share one definition. B2 only publishes them; B3+ re-lays the shell out on them.
 *
 * Sizes are CSS pixels of the window's content area (after the OS display scaling), never design pixels.
 */

/** ≥ 1600: the tool drawer may dock beside the canvas and the right column is full width. */
export const WIDTH_WIDE = 1600
/** 1280–1599: the drawer floats over the canvas and the right column is narrower. Below: condensed chrome. */
export const WIDTH_MEDIUM = 1280
/** ≥ 860: Properties and Layers stack. Below: Properties | Layers tabs. */
export const HEIGHT_TALL = 860
/** < 720: compact selection toolbar and near-full-height dialogs. */
export const HEIGHT_SHORT = 720

/** The smallest canvas viewport the shell must leave free (B1 sign-off). */
export const MIN_CANVAS_VIEWPORT = Object.freeze({ width: 520, height: 400 })

export type WidthTier = 'wide' | 'medium' | 'narrow'
export type HeightTier = 'tall' | 'short' | 'very-short'

export const widthTier = (width: number): WidthTier =>
  width >= WIDTH_WIDE ? 'wide' : width >= WIDTH_MEDIUM ? 'medium' : 'narrow'

export const heightTier = (height: number): HeightTier =>
  height >= HEIGHT_TALL ? 'tall' : height >= HEIGHT_SHORT ? 'short' : 'very-short'

/** Properties and Layers share the right column as tabs instead of stacking. */
export const usesPanelTabs = (height: number): boolean => heightTier(height) !== 'tall'

/** The tool drawer may dock (push the canvas) rather than float over it. */
export const drawerMayDock = (width: number): boolean => widthTier(width) === 'wide'

/**
 * The label for the Print Preview action (B1 R4): the friendly "See how it prints" while there is room, "Preview"
 * (with the eye icon) on narrow windows. It never collapses to icon-only while the shorter label fits.
 */
export const printPreviewActionLabel = (width: number): string =>
  widthTier(width) === 'narrow' ? 'Preview' : 'See how it prints'

/** Dialogs keep this much room around them; on very short windows they use nearly the full height. */
export const dialogMaxHeight = (viewportHeight: number): number =>
  heightTier(viewportHeight) === 'very-short'
    ? Math.max(0, viewportHeight - 24)
    : Math.round(viewportHeight * 0.86)
