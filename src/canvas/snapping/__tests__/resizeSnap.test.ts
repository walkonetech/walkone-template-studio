import { describe, expect, it } from 'vitest'
import { computeResizeSnap, movingEdgesFor } from '../resizeSnap'

const design = { width: 600, height: 1800 }
const R = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom
})

describe('movingEdgesFor', () => {
  it('maps Konva anchor names to the edges they move', () => {
    expect(movingEdgesFor('bottom-right')).toEqual({
      left: false,
      right: true,
      top: false,
      bottom: true
    })
    expect(movingEdgesFor('middle-left')).toEqual({
      left: true,
      right: false,
      top: false,
      bottom: false
    })
    expect(movingEdgesFor('top-center')).toEqual({
      left: false,
      right: false,
      top: true,
      bottom: false
    })
    expect(movingEdgesFor('rotater')).toBeNull()
    expect(movingEdgesFor(null)).toBeNull()
  })
})

describe('computeResizeSnap', () => {
  const right = { left: false, right: true, top: false, bottom: false }

  it('snaps the moving edge to another object edge and shows a guide', () => {
    const r = computeResizeSnap(
      R(50, 500, 393, 700),
      right,
      false,
      [R(100, 50, 400, 250)],
      design,
      10
    )
    expect(r.box).toEqual(R(50, 500, 400, 700))
    expect(r.guides).toEqual([{ axis: 'x', at: 400 }])
  })

  it('snaps to the same width as another object (Canva-style) and marks both', () => {
    // other: 300 wide at x 200..500; moving box from x=20 → a 300-wide box ends at 320 (no edge near there)
    const other = R(200, 50, 500, 250)
    const r = computeResizeSnap(R(20, 600, 316, 700), right, false, [other], design, 10)
    expect(r.box.right).toBe(320)
    expect(r.guides).toEqual([])
    expect(r.sizeMarks).toEqual([
      { axis: 'x', rect: R(20, 600, 320, 700) },
      { axis: 'x', rect: other }
    ])
  })

  it('does nothing beyond the tolerance', () => {
    const r = computeResizeSnap(
      R(20, 600, 250, 700),
      right,
      false,
      [R(200, 50, 500, 250)],
      design,
      10
    )
    expect(r.box).toEqual(R(20, 600, 250, 700))
    expect(r.guides).toEqual([])
    expect(r.sizeMarks).toEqual([])
  })

  it('keeps the aspect ratio on a proportional corner resize, anchored at the opposite corner', () => {
    // 3:2 photo slot dragged from bottom-right; the other photo is 516×344 (same ratio)
    const other = R(42, 57, 558, 401)
    const box = R(42, 500, 42 + 510, 500 + 340)
    const r = computeResizeSnap(
      box,
      { left: false, right: true, top: false, bottom: true },
      true,
      [other],
      design,
      10
    )
    expect(r.box.left).toBe(42)
    expect(r.box.top).toBe(500)
    expect(r.box.right).toBe(558)
    expect(r.box.bottom - r.box.top).toBeCloseTo(344, 6)
    // the width snapped, and the derived height now matches too: both marks for both rects
    expect(r.sizeMarks.map((m) => m.axis)).toEqual(['x', 'x', 'y', 'y'])
  })

  it('snaps a top-left corner by moving the left/top edges', () => {
    const r = computeResizeSnap(
      R(-4, 103, 300, 400),
      { left: true, right: false, top: true, bottom: false },
      false,
      [],
      design,
      10
    )
    expect(r.box).toEqual(R(0, 103, 300, 400))
    expect(r.guides).toEqual([{ axis: 'x', at: 0 }])
  })

  it('snaps both axes independently when the ratio is free', () => {
    const r = computeResizeSnap(
      R(10, 10, 297, 896),
      { left: false, right: true, top: false, bottom: true },
      false,
      [],
      design,
      10
    )
    expect(r.box).toEqual(R(10, 10, 300, 900))
    expect(r.guides).toEqual([
      { axis: 'x', at: 300 },
      { axis: 'y', at: 900 }
    ])
  })

  it('never snaps the axis a side handle does not move', () => {
    const r = computeResizeSnap(R(10, 3, 200, 100), right, false, [], design, 10)
    expect(r.box.top).toBe(3)
  })
})
