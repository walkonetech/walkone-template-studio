// Numeric tolerance for built-app checks (Phase 7B B5.1).
//
// devicePixelRatio can come back as 1.0000000149 instead of exactly 1 on Windows: that is 1 + 2^-26, the float32
// rounding of the device scale factor Chromium carries internally. It is representation noise, not zoom.
//
// DPR_EPSILON = 1e-6 is ~67x that float32 noise and still about five orders of magnitude below the smallest real
// change we must catch: Chromium page zoom steps (0.9 / 1.1 = ±0.1), app/OS scale steps (1.25, 1.5, …) and any
// fractional zoom a user could produce (≥ 0.01). A real page-zoom or device-scale regression always fails.
const DPR_EPSILON = 1e-6

/** True when |actual − expected| ≤ epsilon (and actual is a finite number). */
function nearlyEqual(actual, expected, epsilon) {
  return (
    typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon
  )
}

/** True when the observed devicePixelRatio is effectively `expected` (default 1). */
const dprIs = (actual, expected = 1) => nearlyEqual(actual, expected, DPR_EPSILON)

// ---- focus rings in PHYSICAL device pixels (Phase 7B B6.1) ---------------------------------------------------------
//
// Chromium snaps an outline to whole pixels of the display it is really drawing on. `Emulation.setDeviceMetricsOverride`
// changes the devicePixelRatio the PAGE reports, but on Windows it does not change the backing scale of the window:
// on a 125 % display with deviceScaleFactor 1 emulated, a 2 px ring is computed as 1.6 CSS px (2 device px ÷ 1.25)
// while devicePixelRatio says ~1. Multiplying by the emulated ratio then reports 1.6 "device px" for a ring that is
// 2 real pixels on screen (Craft Anything measured it from screenshots; checks 28 and 55 failed only for that reason).
//
// So: the scale the ring was snapped to is the one at which its computed width is a whole number of pixels. Try the
// ratio the page reports first, then the display's real (native) ratio measured before any emulation. If neither
// gives a whole number, keep the reported ratio (conservative: never rounds up). The requirement itself is unchanged:
// at least 2 physical device pixels. A ring that is really thinner — e.g. 1 device px (0.8 CSS px at 125 %) — still
// fails under either scale.
const WHOLE_PX_EPSILON = 0.02

const isWhole = (v) => Math.abs(v - Math.round(v)) <= WHOLE_PX_EPSILON

/** Physical device pixels of a computed outline width, and which scale it was snapped to. */
function ringDevicePx({ cssWidth, reportedDpr, nativeDpr }) {
  const candidates = [
    ['reported', reportedDpr],
    ['native', nativeDpr]
  ].filter(([, s]) => typeof s === 'number' && Number.isFinite(s) && s > 0)
  const hit = candidates.find(([, s]) => isWhole(cssWidth * s))
  const [basis, scale] = hit ?? candidates[0] ?? ['reported', 1]
  return { devicePx: +(cssWidth * scale).toFixed(2), scale, basis }
}

module.exports = { DPR_EPSILON, nearlyEqual, dprIs, WHOLE_PX_EPSILON, ringDevicePx }
