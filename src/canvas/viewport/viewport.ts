/**
 * View transform kept strictly separate from design geometry. All values are CSS pixels; the
 * device pixel ratio is a canvas backing-store concern and never enters these functions or the domain.
 */

export interface Size {
  width: number
  height: number
}

/** screen = design × scale + offset (CSS pixels within the viewport). Design coordinates never change. */
export interface ViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/** Largest scale that fits the whole design in the viewport with padding, centered. */
export function fitView(design: Size, viewport: Size, padding = 24): ViewTransform {
  const scale = Math.min(
    (viewport.width - padding * 2) / design.width,
    (viewport.height - padding * 2) / design.height
  )
  return centeredView(design, viewport, scale)
}

/** A given scale with the design centered in the viewport. scale 1 = one design pixel per CSS pixel. */
export function centeredView(design: Size, viewport: Size, scale: number): ViewTransform {
  return {
    scale,
    offsetX: (viewport.width - design.width * scale) / 2,
    offsetY: (viewport.height - design.height * scale) / 2
  }
}

export const designToScreen = (
  v: ViewTransform,
  x: number,
  y: number
): { x: number; y: number } => ({
  x: x * v.scale + v.offsetX,
  y: y * v.scale + v.offsetY
})

export const screenToDesign = (
  v: ViewTransform,
  x: number,
  y: number
): { x: number; y: number } => ({
  x: (x - v.offsetX) / v.scale,
  y: (y - v.offsetY) / v.scale
})

/** Snap distance expressed in design units so it feels the same on screen at every zoom. */
export const snapToleranceDesign = (screenPx: number, v: ViewTransform): number =>
  screenPx / v.scale

export const MIN_SCALE = 0.02
export const MAX_SCALE = 4
export const ZOOM_STEP = 1.25

/** What the editor stores: either "fit to window" (follows the window) or an explicit manual view. */
export type ViewState =
  { mode: 'fit' } | { mode: 'manual'; scale: number; offsetX: number; offsetY: number }

export const clampScale = (scale: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))

/** Turns a stored view state into a concrete transform for the current viewport size. */
export function resolveView(
  state: ViewState,
  design: Size,
  viewport: Size,
  padding = 24
): ViewTransform {
  return state.mode === 'fit'
    ? fitView(design, viewport, padding)
    : { scale: clampScale(state.scale), offsetX: state.offsetX, offsetY: state.offsetY }
}

export const toManual = (v: ViewTransform): ViewState => ({
  mode: 'manual',
  scale: v.scale,
  offsetX: v.offsetX,
  offsetY: v.offsetY
})

/**
 * Zooms by `factor` keeping the design point under `anchor` (viewport CSS px) fixed. The result is
 * clamped to [MIN_SCALE, MAX_SCALE]; if clamped, the factor is reduced accordingly.
 */
export function zoomAt(
  view: ViewTransform,
  factor: number,
  anchor: { x: number; y: number }
): ViewTransform {
  const scale = clampScale(view.scale * factor)
  const k = scale / view.scale
  return {
    scale,
    offsetX: anchor.x - (anchor.x - view.offsetX) * k,
    offsetY: anchor.y - (anchor.y - view.offsetY) * k
  }
}

export const panBy = (view: ViewTransform, dx: number, dy: number): ViewTransform => ({
  ...view,
  offsetX: view.offsetX + dx,
  offsetY: view.offsetY + dy
})

/** Zoom in (+1) or out (-1) by one step around the viewport center. */
export function zoomStep(view: ViewTransform, direction: 1 | -1, viewport: Size): ViewTransform {
  const factor = direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP
  return zoomAt(view, factor, { x: viewport.width / 2, y: viewport.height / 2 })
}
