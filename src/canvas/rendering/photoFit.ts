import type { FitMode } from '@domain'

/**
 * Photo placement inside a PhotoLayer's frame: how a preview picture is fitted (cover / contain / stretch) and then
 * repositioned and magnified by an editor-only CROP. Pure arithmetic in design pixels, shared by Design mode, Print
 * Preview and the exact-size render, so all three always agree.
 *
 * Crop model (editor/session state, never project data; see ADR-038):
 *   zoom ≥ 1   magnification on top of the fit scale (1 = exactly the fit)
 *   x, y ∈ [-1, 1]   where the picture sits inside the slack the frame leaves: -1 = picture's left/top edge flush
 *                    with the frame, 0 = centred, +1 = right/bottom edge flush. With no slack (an axis that exactly
 *                    fills) the value has no effect, so the picture can never be dragged off its frame.
 */
export interface PhotoCrop {
  zoom: number
  x: number
  y: number
}

export const DEFAULT_CROP: PhotoCrop = { zoom: 1, x: 0, y: 0 }
export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 4

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function clampCrop(c: PhotoCrop): PhotoCrop {
  return {
    zoom: clamp(Number.isFinite(c.zoom) ? c.zoom : 1, MIN_CROP_ZOOM, MAX_CROP_ZOOM),
    x: clamp(Number.isFinite(c.x) ? c.x : 0, -1, 1),
    y: clamp(Number.isFinite(c.y) ? c.y : 0, -1, 1)
  }
}

export const isDefaultCrop = (c: PhotoCrop | undefined): boolean =>
  !c || (c.zoom === 1 && c.x === 0 && c.y === 0)

export interface PhotoPlacement {
  /** Source rectangle (picture pixels) and destination rectangle (frame-local design pixels) for drawImage. */
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

interface Size {
  width: number
  height: number
}

/** Scale (design px per picture px) the fit mode gives before any crop zoom. 'stretch' has two scales. */
function baseScale(src: Size, box: Size, fit: FitMode): { sx: number; sy: number } {
  const kx = box.width / src.width
  const ky = box.height / src.height
  if (fit === 'stretch') return { sx: kx, sy: ky }
  const k = fit === 'cover' ? Math.max(kx, ky) : Math.min(kx, ky)
  return { sx: k, sy: k }
}

/** Slack (design px) the magnified picture leaves on each axis; ≤ 0 means it is smaller than the frame there. */
export function cropSlack(
  src: Size,
  box: Size,
  fit: FitMode,
  zoom: number
): { x: number; y: number } {
  if (fit === 'stretch') return { x: 0, y: 0 }
  const b = baseScale(src, box, fit)
  const z = clamp(zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM)
  return { x: src.width * b.sx * z - box.width, y: src.height * b.sy * z - box.height }
}

/**
 * Where to draw a picture inside a frame of `box` size (origin top-left). The destination may be larger than the
 * frame (cover, zoom): callers clip to the frame. Smaller than the frame (contain): it is centred on that axis.
 */
export function placePhoto(
  src: Size,
  box: Size,
  fit: FitMode,
  crop: PhotoCrop = DEFAULT_CROP
): PhotoPlacement {
  const c = clampCrop(crop)
  const b = baseScale(src, box, fit)
  const zoom = fit === 'stretch' ? 1 : c.zoom
  const dw = src.width * b.sx * zoom
  const dh = src.height * b.sy * zoom
  const place = (size: number, frame: number, t: number): number => {
    const slack = size - frame
    // Smaller than the frame: centred. Larger: slide within the slack.
    return (slack <= 0 ? -slack / 2 : (-(1 + t) / 2) * slack) || 0 // `|| 0` normalizes -0
  }
  const dx = place(dw, box.width, c.x)
  const dy = place(dh, box.height, c.y)
  return { sx: 0, sy: 0, sw: src.width, sh: src.height, dx, dy, dw, dh }
}

/**
 * New crop after the user drags the picture by `delta` design pixels (positive = picture moves right/down).
 * Axes without slack do not move.
 */
export function dragCrop(
  crop: PhotoCrop,
  delta: { x: number; y: number },
  slack: { x: number; y: number }
): PhotoCrop {
  const c = clampCrop(crop)
  return clampCrop({
    zoom: c.zoom,
    x: slack.x > 0 ? c.x - (2 * delta.x) / slack.x : c.x,
    y: slack.y > 0 ? c.y - (2 * delta.y) / slack.y : c.y
  })
}

/**
 * Changes the crop zoom while keeping the picture point at the frame centre fixed as far as the slack allows
 * (the normalized position is re-derived against the new slack).
 */
export function zoomCrop(
  crop: PhotoCrop,
  zoom: number,
  src: Size,
  box: Size,
  fit: FitMode
): PhotoCrop {
  const before = clampCrop(crop)
  const next = clamp(zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM)
  if (fit === 'stretch') return { ...before, zoom: 1 }
  const b = baseScale(src, box, fit)
  // picture coordinate (0..1) at the frame centre before zooming
  const centreAt = (c: PhotoCrop, axis: 'x' | 'y'): number => {
    const p = placePhoto(src, box, fit, c)
    return axis === 'x' ? (box.width / 2 - p.dx) / p.dw : (box.height / 2 - p.dy) / p.dh
  }
  const fx = centreAt(before, 'x')
  const fy = centreAt(before, 'y')
  const dw = src.width * b.sx * next
  const dh = src.height * b.sy * next
  const solve = (frac: number, size: number, frame: number, fallback: number): number => {
    const slack = size - frame
    if (slack <= 0) return fallback
    // dx = frame/2 - frac*size  and  dx = -(1+t)/2*slack  → t = 2*(frac*size - frame/2)/slack - 1
    return (2 * (frac * size - frame / 2)) / slack - 1
  }
  return clampCrop({
    zoom: next,
    x: solve(fx, dw, box.width, before.x),
    y: solve(fy, dh, box.height, before.y)
  })
}

/** Frame stroke that cannot swallow the photo: at most half of the shorter side. */
export const clampFrameThickness = (thickness: number, width: number, height: number): number =>
  Math.max(0, Math.min(thickness, Math.min(width, height) / 2))

/** Corner radius that cannot exceed half of the shorter side (a pill/circle at most). */
export const clampCornerRadius = (radius: number, width: number, height: number): number =>
  Math.max(0, Math.min(radius, Math.min(width, height) / 2))
