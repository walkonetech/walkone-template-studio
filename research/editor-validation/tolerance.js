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

module.exports = { DPR_EPSILON, nearlyEqual, dprIs }
