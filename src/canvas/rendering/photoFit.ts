/**
 * Photo-slot geometry clamps, in design pixels, shared by the editor, Print Preview, the exact-size render and the
 * dslrBooth adapter so all of them agree. (The sample-photo fit/crop math that used to live here was removed with
 * Sample Photos in Phase 7B B3.1: a photo slot never shows a picture in Template Studio.)
 */

/** Frame stroke that cannot swallow the photo: at most half of the shorter side. */
export const clampFrameThickness = (thickness: number, width: number, height: number): number =>
  Math.max(0, Math.min(thickness, Math.min(width, height) / 2))

/** Corner radius that cannot exceed half of the shorter side (a pill/circle at most). */
export const clampCornerRadius = (radius: number, width: number, height: number): number =>
  Math.max(0, Math.min(radius, Math.min(width, height) / 2))
