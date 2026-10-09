import { describe, expect, it } from 'vitest'
import {
  AXIS_LOCK_THRESHOLD_PX,
  constrainDrag,
  initialAxisLock,
  restrictSnap,
  type AxisLockState
} from '../axisLock'

const T = AXIS_LOCK_THRESHOLD_PX

describe('Shift-constrained drag', () => {
  it('without Shift the drag is free and the lock resets', () => {
    const r = constrainDrag({ axis: 'x' }, { x: 40, y: 12 }, false, T)
    expect(r.delta).toEqual({ x: 40, y: 12 })
    expect(r.state.axis).toBeNull()
  })
  it('dominant horizontal movement locks Y (deltaX 180, deltaY 22)', () => {
    const r = constrainDrag(initialAxisLock(), { x: 180, y: 22 }, true, T)
    expect(r.delta).toEqual({ x: 180, y: 0 })
    expect(r.state.axis).toBe('x')
  })
  it('dominant vertical movement locks X (deltaX 17, deltaY 140)', () => {
    const r = constrainDrag(initialAxisLock(), { x: 17, y: 140 }, true, T)
    expect(r.delta).toEqual({ x: 0, y: 140 })
    expect(r.state.axis).toBe('y')
  })
  it('small jitter below the threshold neither moves nor commits to an axis', () => {
    const r = constrainDrag(initialAxisLock(), { x: 3, y: 4 }, true, T)
    expect(r.delta).toEqual({ x: 0, y: 0 })
    expect(r.state.axis).toBeNull()
  })
  it('once locked the axis is stable even if the pointer later drifts the other way', () => {
    let s: AxisLockState = initialAxisLock()
    s = constrainDrag(s, { x: 50, y: 5 }, true, T).state
    expect(s.axis).toBe('x')
    const later = constrainDrag(s, { x: 52, y: 300 }, true, T)
    expect(later.state.axis).toBe('x')
    expect(later.delta).toEqual({ x: 52, y: 0 })
  })
  it('releasing Shift mid-gesture frees the movement; pressing it again re-decides', () => {
    let s: AxisLockState = constrainDrag(initialAxisLock(), { x: 80, y: 3 }, true, T).state
    const free = constrainDrag(s, { x: 80, y: 120 }, false, T)
    expect(free.delta).toEqual({ x: 80, y: 120 })
    s = free.state
    expect(s.axis).toBeNull()
    const again = constrainDrag(s, { x: 80, y: 120 }, true, T)
    expect(again.state.axis).toBe('y')
  })
  it('ties choose horizontal; negative deltas work; works off-artboard (no clamping)', () => {
    expect(constrainDrag(initialAxisLock(), { x: 30, y: -30 }, true, T).state.axis).toBe('x')
    expect(constrainDrag(initialAxisLock(), { x: -5000, y: 10 }, true, T).delta).toEqual({
      x: -5000,
      y: 0
    })
  })
  it('the threshold scales with zoom (6 screen px is more design px when zoomed out)', () => {
    const zoomedOut = 6 / 0.2
    expect(constrainDrag(initialAxisLock(), { x: 20, y: 0 }, true, zoomedOut).state.axis).toBeNull()
    expect(constrainDrag(initialAxisLock(), { x: 40, y: 0 }, true, zoomedOut).state.axis).toBe('x')
  })
  it('snapping can only adjust the free axis', () => {
    const snap = { dx: 4, dy: -3, guides: [] as { axis: 'x' | 'y'; at: number }[] }
    expect(restrictSnap(snap, 'x')).toEqual({ ...snap, dy: 0 })
    expect(restrictSnap(snap, 'y')).toEqual({ ...snap, dx: 0 })
    expect(restrictSnap(snap, null)).toEqual(snap)
  })
})
