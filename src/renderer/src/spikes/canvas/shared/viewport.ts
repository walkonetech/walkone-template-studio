/** SPIKE (Phase 3A): view transform kept strictly separate from design geometry. */

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
