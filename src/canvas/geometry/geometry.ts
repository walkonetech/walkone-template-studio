/** Library-neutral geometry helpers. Pure functions, unit tested. */

/** Domain geometry: top-left of the UNROTATED box, rotation in degrees clockwise about the box center. */
export interface Geometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface CenterBox {
  cx: number
  cy: number
  width: number
  height: number
  rotation: number
}

export const toCenterBox = (g: Geometry): CenterBox => ({
  cx: g.x + g.width / 2,
  cy: g.y + g.height / 2,
  width: g.width,
  height: g.height,
  rotation: g.rotation
})

export const fromCenterBox = (c: CenterBox): Geometry => ({
  x: c.cx - c.width / 2,
  y: c.cy - c.height / 2,
  width: c.width,
  height: c.height,
  rotation: c.rotation
})

/** Libraries report a resize as scale factors on an unchanged base size; fold them into width/height. */
export function normalizeScale(c: CenterBox, scaleX: number, scaleY: number): CenterBox {
  return { ...c, width: c.width * Math.abs(scaleX), height: c.height * Math.abs(scaleY) }
}

/** Affine matrix [a, b, c, d, e, f] as used by canvas 2D: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = readonly [number, number, number, number, number, number]

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ]
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2]
  if (det === 0) throw new RangeError('Matrix is not invertible')
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det
  ]
}

export function applyToPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

/**
 * Turns a node's matrix (in DESIGN space) plus its local, unscaled size into domain geometry.
 * `origin` says where the node's local (0,0) sits: its top-left or its center.
 * Flips and skew are not representable in the domain and are ignored.
 */
export function matrixToGeometry(
  m: Matrix,
  localWidth: number,
  localHeight: number,
  origin: 'top-left' | 'center'
): Geometry {
  const center =
    origin === 'center' ? applyToPoint(m, 0, 0) : applyToPoint(m, localWidth / 2, localHeight / 2)
  return fromCenterBox({
    cx: center.x,
    cy: center.y,
    width: localWidth * Math.hypot(m[0], m[1]),
    height: localHeight * Math.hypot(m[2], m[3]),
    rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI
  })
}

/** Wraps an angle into (-180, 180]. */
export function wrapDegrees(deg: number): number {
  const r = ((((deg + 180) % 360) + 360) % 360) - 180
  return r === -180 ? 180 : r
}
