import { describe, expect, it } from 'vitest'
import {
  applyToPoint,
  fromCenterBox,
  IDENTITY,
  invert,
  matrixToGeometry,
  multiply,
  normalizeScale,
  toCenterBox,
  wrapDegrees,
  type Matrix
} from '../geometry'

const rot = (deg: number): Matrix => {
  const a = (deg * Math.PI) / 180
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y]
const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0]

describe('center-box conversion (domain geometry <-> library origin)', () => {
  it('round-trips and keeps rotation about the box center', () => {
    const g = { x: 250, y: 2160, width: 1900, height: 880, rotation: 12 }
    const c = toCenterBox(g)
    expect(c).toEqual({ cx: 1200, cy: 2600, width: 1900, height: 880, rotation: 12 })
    expect(fromCenterBox(c)).toEqual(g)
  })

  it('supports negative and off-canvas positions without clamping', () => {
    const g = { x: -200, y: 3050, width: 1100, height: 90, rotation: 0 }
    expect(fromCenterBox(toCenterBox(g))).toEqual(g)
  })
})

describe('scale normalization', () => {
  it('folds scale factors into width/height', () => {
    const c = normalizeScale({ cx: 10, cy: 20, width: 100, height: 50, rotation: 5 }, 2, 0.5)
    expect(c).toEqual({ cx: 10, cy: 20, width: 200, height: 25, rotation: 5 })
  })

  it('ignores flip sign (domain cannot represent flips)', () => {
    expect(normalizeScale({ cx: 0, cy: 0, width: 10, height: 10, rotation: 0 }, -2, 1).width).toBe(
      20
    )
  })
})

describe('matrix helpers', () => {
  it('multiply and invert are consistent', () => {
    const m = multiply(translate(30, 40), multiply(rot(30), scale(2, 3)))
    const id = multiply(m, invert(m))
    id.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY[i] ?? 0, 9))
  })

  it('rejects singular matrices', () => {
    expect(() => invert([0, 0, 0, 0, 1, 1])).toThrow(RangeError)
  })

  it('applies to points', () => {
    expect(applyToPoint(translate(5, 7), 1, 2)).toEqual({ x: 6, y: 9 })
  })
})

describe('matrixToGeometry (library matrix in design space -> domain geometry)', () => {
  it('top-left origin node, scaled and rotated', () => {
    // node local box 100x50, placed with top-left at (200,300), scaled 2x, rotated 90° about its top-left
    const m = multiply(translate(200, 300), multiply(rot(90), scale(2, 2)))
    const g = matrixToGeometry(m, 100, 50, 'top-left')
    expect(g.width).toBeCloseTo(200, 9)
    expect(g.height).toBeCloseTo(100, 9)
    expect(g.rotation).toBeCloseTo(90, 9)
    // center = M * (50, 25) = (200 - 50, 300 + 100) = (150, 400)
    expect(g.x + g.width / 2).toBeCloseTo(150, 9)
    expect(g.y + g.height / 2).toBeCloseTo(400, 9)
  })

  it('center origin node', () => {
    const m = multiply(translate(1200, 2600), rot(-15))
    const g = matrixToGeometry(m, 1900, 880, 'center')
    expect(g.width).toBeCloseTo(1900, 9)
    expect(g.height).toBeCloseTo(880, 9)
    expect(g.rotation).toBeCloseTo(-15, 9)
    expect(g.x).toBeCloseTo(250, 9)
    expect(g.y).toBeCloseTo(2160, 9)
  })

  it('removes a view transform before reading geometry (zoom must not leak into the domain)', () => {
    const view = multiply(translate(24, 12), scale(0.1867, 0.1867))
    const node = multiply(translate(250, 2160), IDENTITY)
    const abs = multiply(view, node)
    const design = multiply(invert(view), abs)
    const g = matrixToGeometry(design, 1900, 880, 'top-left')
    expect(g.x).toBeCloseTo(250, 6)
    expect(g.y).toBeCloseTo(2160, 6)
    expect(g.width).toBeCloseTo(1900, 6)
  })
})

describe('wrapDegrees', () => {
  it.each([
    [0, 0],
    [181, -179],
    [-181, 179],
    [540, 180],
    [-180, 180],
    [360, 0]
  ])('%d -> %d', (input, expected) => {
    expect(wrapDegrees(input)).toBe(expected)
  })
})
