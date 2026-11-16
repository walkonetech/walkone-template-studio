import type { Guide, Rect } from './snap'

/**
 * Library-neutral snapping for a RESIZE (Canva-style), in design coordinates. Only the edges the handle moves can
 * snap: to the design edges/centre, to other objects' edges/centres, or so the box gets the SAME width/height as
 * another object. A proportional resize (corner handle with keepRatio) snaps the one axis with the closest match
 * and derives the other side from the ratio, keeping the opposite corner fixed.
 */

export interface MovingEdges {
  left: boolean
  right: boolean
  top: boolean
  bottom: boolean
}

/** A size match to draw: a dimension mark along `axis` ('x' = width, 'y' = height) across `rect`. */
export interface SizeMark {
  axis: 'x' | 'y'
  rect: Rect
}

export interface ResizeSnapResult {
  box: Rect
  guides: Guide[]
  sizeMarks: SizeMark[]
}

/** Two sizes this close (design px) count as "the same" for the marks shown after snapping. */
const SAME = 0.5

/** Konva anchor name → the box edges that handle moves. */
export function movingEdgesFor(anchor: string | null | undefined): MovingEdges | null {
  if (!anchor || anchor === 'rotater') return null
  return {
    left: anchor.endsWith('left'),
    right: anchor.endsWith('right'),
    top: anchor.startsWith('top'),
    bottom: anchor.startsWith('bottom')
  }
}

interface AxisSnap {
  /** Amount to add to the moving edge. */
  d: number
  /** Guide line position for an edge/centre snap, or the matched rect for a size snap. */
  guide?: number
  size?: Rect
}

function snapAxis(
  lo: number,
  hi: number,
  movingLo: boolean,
  movingHi: boolean,
  targets: number[],
  others: Rect[],
  axis: 'x' | 'y',
  tolerance: number
): AxisSnap | null {
  // A handle moves exactly one edge per axis; both or neither (centred scaling, or a side handle on the other
  // axis) means there is nothing to snap on this axis.
  if (movingLo === movingHi) return null
  const edge = movingLo ? lo : hi
  let best: AxisSnap | null = null
  const consider = (c: AxisSnap): void => {
    if (Math.abs(c.d) <= tolerance && (!best || Math.abs(c.d) < Math.abs(best.d))) best = c
  }
  for (const t of targets) consider({ d: t - edge, guide: t })
  for (const o of others) {
    const size = axis === 'x' ? o.right - o.left : o.bottom - o.top
    const want = movingLo ? hi - size : lo + size
    consider({ d: want - edge, size: o })
  }
  return best
}

const sizeOf = (r: Rect, axis: 'x' | 'y'): number =>
  axis === 'x' ? r.right - r.left : r.bottom - r.top

export function computeResizeSnap(
  box: Rect,
  moving: MovingEdges,
  keepRatio: boolean,
  others: Rect[],
  design: { width: number; height: number },
  tolerance: number
): ResizeSnapResult {
  const targetsX = [0, design.width / 2, design.width]
  const targetsY = [0, design.height / 2, design.height]
  for (const o of others) {
    targetsX.push(o.left, (o.left + o.right) / 2, o.right)
    targetsY.push(o.top, (o.top + o.bottom) / 2, o.bottom)
  }
  let sx = snapAxis(
    box.left,
    box.right,
    moving.left,
    moving.right,
    targetsX,
    others,
    'x',
    tolerance
  )
  let sy = snapAxis(
    box.top,
    box.bottom,
    moving.top,
    moving.bottom,
    targetsY,
    others,
    'y',
    tolerance
  )
  const corner = (moving.left || moving.right) && (moving.top || moving.bottom)
  const proportional = keepRatio && corner
  if (proportional && sx && sy) {
    if (Math.abs(sx.d) <= Math.abs(sy.d)) sy = null
    else sx = null
  }

  const out: Rect = { ...box }
  const apply = (s: AxisSnap | null, axis: 'x' | 'y'): void => {
    if (!s) return
    if (axis === 'x') {
      if (moving.left) out.left += s.d
      else out.right += s.d
    } else if (moving.top) out.top += s.d
    else out.bottom += s.d
  }
  apply(sx, 'x')
  apply(sy, 'y')

  if (proportional && (sx || sy)) {
    // Re-derive the other side from the original aspect ratio, anchored at the fixed (opposite) corner.
    const ratio = (box.right - box.left) / (box.bottom - box.top)
    if (sx) {
      const h = (out.right - out.left) / ratio
      if (moving.top) out.top = out.bottom - h
      else out.bottom = out.top + h
    } else {
      const w = (out.bottom - out.top) * ratio
      if (moving.left) out.left = out.right - w
      else out.right = out.left + w
    }
  }

  const guides: Guide[] = []
  if (sx?.guide !== undefined) guides.push({ axis: 'x', at: sx.guide })
  if (sy?.guide !== undefined) guides.push({ axis: 'y', at: sy.guide })

  // Show every size the result now shares with another object (a snapped width often matches the height too).
  const sizeMarks: SizeMark[] = []
  if (sx || sy)
    for (const axis of ['x', 'y'] as const) {
      const matches = others.filter((o) => Math.abs(sizeOf(o, axis) - sizeOf(out, axis)) <= SAME)
      if (matches.length > 0)
        sizeMarks.push({ axis, rect: out }, ...matches.map((rect) => ({ axis, rect })))
    }
  return { box: out, guides, sizeMarks }
}
