/**
 * Physical-unit conversions for Output Profiles (pure, deterministic). Profiles state physical-output values in
 * millimetres because that is how printers, media and measurement prints are described; Template Studio's project
 * stores its print size in inches and its resolution in DPI, and canvas geometry in design pixels. Safe-area math is
 * done in millimetres first and converted to pixels at the project's own DPI, so the same 3 mm is 35.43 px at 300 DPI
 * and 70.87 px at 600 DPI. Nothing here rounds: callers decide when (and whether) a value becomes a whole pixel.
 */

export const MM_PER_INCH = 25.4

export const mmToInches = (mm: number): number => mm / MM_PER_INCH
export const inchesToMm = (inches: number): number => inches * MM_PER_INCH

/** Millimetres → design pixels at `dpi` (fractional). */
export const mmToPx = (mm: number, dpi: number): number => (mm / MM_PER_INCH) * dpi

/** Design pixels at `dpi` → millimetres. */
export const pxToMm = (px: number, dpi: number): number => (px / dpi) * MM_PER_INCH

/** Inches → design pixels at `dpi` (fractional; the domain's `inchesToPixels` rounds for canvas sizes). */
export const inchesToPx = (inches: number, dpi: number): number => inches * dpi

/** A millimetre value for messages: one decimal, never "-0.0". */
export function formatMm(mm: number): string {
  const r = Math.round(mm * 10) / 10
  return `${Object.is(r, -0) ? 0 : r} mm`
}
