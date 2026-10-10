import { describe, expect, it } from 'vitest'
import { photo, shape, text, group } from '../../../editor/__tests__/helpers'
import {
  boxTooSmall,
  enforceMinSize,
  MIN_SIZE_DESIGN,
  normalizeFromMatrix,
  normalizeNodeTransform,
  normalizeTextTransform,
  roundGeometry,
  transformerOptionsFor
} from '../normalize'

const node = { x: 1200, y: 2600, width: 800, height: 400, scaleX: 1, scaleY: 1, rotation: 0 }

describe('normalizeNodeTransform (Konva node attrs -> domain geometry)', () => {
  it('turns an untouched node into its box (center -> top-left)', () => {
    expect(normalizeNodeTransform(node)).toEqual({
      x: 800,
      y: 2400,
      width: 800,
      height: 400,
      rotation: 0
    })
  })

  it('folds a resize into width/height: 800 × 1.37 = 1096 with the scale concept removed', () => {
    const g = normalizeNodeTransform({ ...node, scaleX: 1.37 })
    expect(g.width).toBeCloseTo(1096, 6)
    expect(g.height).toBe(400)
    expect(g.x + g.width / 2).toBeCloseTo(1200, 6) // center unchanged
  })

  it('keeps rotation about the center when resizing a rotated node', () => {
    const g = normalizeNodeTransform({ ...node, scaleX: 2, scaleY: 0.5, rotation: 30 })
    expect(g.rotation).toBe(30)
    expect(g.width).toBe(1600)
    expect(g.height).toBe(200)
    expect(g.x + g.width / 2).toBeCloseTo(1200, 6)
    expect(g.y + g.height / 2).toBeCloseTo(2600, 6)
  })

  it('wraps rotation to (-180, 180] and avoids negative zero', () => {
    expect(normalizeNodeTransform({ ...node, rotation: 270 }).rotation).toBe(-90)
    expect(Object.is(normalizeNodeTransform({ ...node, x: 400, width: 800 }).x, -0)).toBe(false)
  })

  it('supports negative and off-canvas positions without clamping', () => {
    const g = normalizeNodeTransform({ ...node, x: -150, y: -80 })
    expect(g.x).toBe(-550)
    expect(g.y).toBe(-280)
  })

  it('ignores flips (negative scale) because the domain cannot represent them', () => {
    expect(normalizeNodeTransform({ ...node, scaleX: -2 }).width).toBe(1600)
  })

  it('does not drift over many repeated transform commits', () => {
    let g = normalizeNodeTransform(node)
    const start = { ...g }
    for (let i = 0; i < 1000; i++) {
      // user scales up by 1.37 then back down; each commit re-bases scale to 1
      const up = normalizeNodeTransform({
        x: g.x + g.width / 2,
        y: g.y + g.height / 2,
        width: g.width,
        height: g.height,
        scaleX: 1.37,
        scaleY: 1.37,
        rotation: g.rotation
      })
      g = normalizeNodeTransform({
        x: up.x + up.width / 2,
        y: up.y + up.height / 2,
        width: up.width,
        height: up.height,
        scaleX: 1 / 1.37,
        scaleY: 1 / 1.37,
        rotation: up.rotation
      })
    }
    expect(Math.abs(g.width - start.width)).toBeLessThan(0.01)
    expect(Math.abs(g.height - start.height)).toBeLessThan(0.01)
    expect(Math.abs(g.x - start.x)).toBeLessThan(0.01)
  })
})

describe('text transform convention', () => {
  it('corner scale multiplies fontSize by scaleY and widens the box by scaleX', () => {
    const r = normalizeTextTransform(
      { ...node, width: 2000, height: 170, scaleX: 1.2, scaleY: 1.5 },
      150
    )
    expect(r.fontSize).toBe(225)
    expect(r.geometry.width).toBe(2400)
  })

  it('a side drag (scaleY 1) leaves fontSize alone', () => {
    expect(normalizeTextTransform({ ...node, scaleX: 0.8 }, 150).fontSize).toBe(150)
  })
})

describe('matrix-based normalization (nested nodes)', () => {
  it('reads top-left-origin nodes in design space', () => {
    const g = normalizeFromMatrix([2, 0, 0, 2, 100, 200], 50, 25, 'top-left')
    expect(g).toEqual({ x: 100, y: 200, width: 100, height: 50, rotation: 0 })
  })
})

describe('minimum size', () => {
  it('clamps tiny layers around their center', () => {
    const g = enforceMinSize({ x: 100, y: 100, width: 2, height: 3, rotation: 0 })
    expect(g.width).toBe(MIN_SIZE_DESIGN)
    expect(g.height).toBe(MIN_SIZE_DESIGN)
    expect(g.x + g.width / 2).toBeCloseTo(101, 9)
  })

  it('leaves valid sizes untouched', () => {
    const g = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
    expect(enforceMinSize(g)).toBe(g)
  })

  it('flags transformer boxes that are too small on screen', () => {
    expect(boxTooSmall({ width: 5, height: 200 })).toBe(true)
    expect(boxTooSmall({ width: -5, height: 200 })).toBe(true)
    expect(boxTooSmall({ width: 50, height: 50 })).toBe(false)
  })
})

describe('roundGeometry', () => {
  it('rounds to 3 decimals', () => {
    expect(
      roundGeometry({ x: 1.23456, y: 2, width: 3.0004, height: 4, rotation: 10.00049 })
    ).toEqual({ x: 1.235, y: 2, width: 3, height: 4, rotation: 10 })
  })
})

describe('transformer options per layer type', () => {
  it('text: proportional corners, no top/bottom anchors', () => {
    const o = transformerOptionsFor(text('t', 0))
    expect(o.keepRatio).toBe(true)
    expect(o.enabledAnchors).not.toContain('top-center')
    expect(o.enabledAnchors).toContain('middle-right')
  })
  it('photos keep their shape: corner handles only, uniform scale', () => {
    const o = transformerOptionsFor(photo('p', 1))
    expect(o.keepRatio).toBe(true)
    expect(o.enabledAnchors).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
  })
  it('images keep ratio; shapes resize freely; flips are never enabled', () => {
    expect(transformerOptionsFor({ ...shape('i', 0), type: 'image' } as never).keepRatio).toBe(true)
    expect(transformerOptionsFor(shape('s', 0)).keepRatio).toBe(false)
    expect(transformerOptionsFor(group('g', 0)).flipEnabled).toBe(false)
  })
})
