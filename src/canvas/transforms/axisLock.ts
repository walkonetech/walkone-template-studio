/**
 * Shift-constrained dragging (Photoshop style). While Shift is held the move is locked to ONE axis, chosen from the
 * dominant direction of the drag once it has travelled a small distance, and then kept until Shift is released:
 * pointer jitter can never flip it between horizontal and vertical.
 *
 * Pure: the canvas feeds it the pointer's displacement since the drag started (design pixels) and applies the result.
 */
export type LockAxis = 'x' | 'y'

export interface AxisLockState {
  axis: LockAxis | null
}

export const initialAxisLock = (): AxisLockState => ({ axis: null })

/** Screen distance (pixels) the pointer must travel before the dominant direction is trusted. */
export const AXIS_LOCK_THRESHOLD_PX = 6

/**
 * @param delta displacement since drag start, design pixels
 * @param shift is Shift held right now
 * @param thresholdDesign AXIS_LOCK_THRESHOLD_PX converted to design pixels at the current zoom
 * @returns the (possibly constrained) delta and the new lock state. `axis: 'x'` keeps x and zeroes y movement.
 */
export function constrainDrag(
  state: AxisLockState,
  delta: { x: number; y: number },
  shift: boolean,
  thresholdDesign: number
): { delta: { x: number; y: number }; state: AxisLockState } {
  if (!shift) return { delta, state: { axis: null } }
  let axis = state.axis
  if (axis === null) {
    const ax = Math.abs(delta.x)
    const ay = Math.abs(delta.y)
    // Wait for a clear direction. Until then the layer stays put on both axes (no jitter, no early commitment).
    if (Math.max(ax, ay) < thresholdDesign) return { delta: { x: 0, y: 0 }, state }
    axis = ax >= ay ? 'x' : 'y'
  }
  return {
    delta: axis === 'x' ? { x: delta.x, y: 0 } : { x: 0, y: delta.y },
    state: { axis }
  }
}

/** Snapping may only adjust the axis the drag is allowed to move along. */
export function restrictSnap<T extends { dx: number; dy: number }>(
  snap: T,
  axis: LockAxis | null
): T {
  if (axis === 'x') return { ...snap, dy: 0 }
  if (axis === 'y') return { ...snap, dx: 0 }
  return snap
}
