/** SPIKE (Phase 3A): library-neutral snapping, so feasibility cost per engine is only the hook-up. */

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Guide {
  axis: 'x' | 'y'
  /** Position in design coordinates. */
  at: number
}

export interface SnapResult {
  /** Amount to add to the moving rect's position. */
  dx: number
  dy: number
  guides: Guide[]
}

/**
 * Snaps a moving rect's left/center/right (and top/middle/bottom) to the design edges, the design
 * center, and the edges/centers of other rects, within `tolerance` design units.
 */
export function computeSnap(
  moving: Rect,
  others: Rect[],
  design: { width: number; height: number },
  tolerance: number
): SnapResult {
  const targetsX = [0, design.width / 2, design.width]
  const targetsY = [0, design.height / 2, design.height]
  for (const o of others) {
    targetsX.push(o.left, (o.left + o.right) / 2, o.right)
    targetsY.push(o.top, (o.top + o.bottom) / 2, o.bottom)
  }
  const mx = [moving.left, (moving.left + moving.right) / 2, moving.right]
  const my = [moving.top, (moving.top + moving.bottom) / 2, moving.bottom]
  const best = (edges: number[], targets: number[]): { d: number; at: number } | null => {
    let found: { d: number; at: number } | null = null
    for (const e of edges)
      for (const t of targets) {
        const d = t - e
        if (Math.abs(d) <= tolerance && (!found || Math.abs(d) < Math.abs(found.d)))
          found = { d, at: t }
      }
    return found
  }
  const bx = best(mx, targetsX)
  const by = best(my, targetsY)
  const guides: Guide[] = []
  if (bx) guides.push({ axis: 'x', at: bx.at })
  if (by) guides.push({ axis: 'y', at: by.at })
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides }
}
