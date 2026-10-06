import { describe, expect, it } from 'vitest'
import { computeSnap, type Rect } from '../snap'

const design = { width: 2400, height: 3600 }
const rect = (left: number, top: number, w: number, h: number): Rect => ({
  left,
  top,
  right: left + w,
  bottom: top + h
})

describe('computeSnap', () => {
  it('snaps the center to the canvas center within tolerance', () => {
    const r = computeSnap(rect(260, 500, 1900, 800), [], design, 20)
    expect(r.dx).toBe(-10) // center x 1210 -> 1200
    expect(r.guides).toContainEqual({ axis: 'x', at: 1200 })
  })

  it('does nothing outside tolerance', () => {
    const r = computeSnap(rect(300, 500, 1900, 800), [], design, 20)
    expect(r.dx).toBe(0)
    expect(r.guides.filter((g) => g.axis === 'x')).toHaveLength(0)
  })

  it('snaps edges to other objects and to the canvas edges', () => {
    const other = rect(100, 1000, 500, 500)
    const r = computeSnap(rect(608, 3, 300, 300), [other], design, 10)
    expect(r.dx).toBe(-8) // left edge 608 -> other.right 600
    expect(r.dy).toBe(-3) // top 3 -> 0
  })

  it('picks the nearest candidate', () => {
    const r = computeSnap(
      rect(97, 0, 300, 300),
      [rect(100, 2000, 10, 10), rect(95, 2200, 10, 10)],
      design,
      10
    )
    expect(r.dx).toBe(-2) // 95 is nearer than 100
  })

  it('works with off-canvas and negative rects', () => {
    const r = computeSnap(rect(-3, 3050, 1100, 90), [], design, 10)
    expect(r.dx).toBe(3) // left -3 -> 0 edge (partially off-canvas objects still snap)
  })
})
