/**
 * Viewport-aware placement for floating UI (tooltips today, picture tooltips later). Pure: the renderer measures the
 * trigger and the floating box, this decides where the box goes so it is ALWAYS fully inside the viewport (minus a
 * margin) and stays attached to its trigger.
 *
 * Rules:
 *  1. Try the preferred side, then the opposite side, then the two remaining sides; use the first where the box fits
 *     on the main axis.
 *  2. If no side fits, use the side with the most room.
 *  3. On the cross axis the box is centred on the trigger, then shifted (clamped) to stay inside the viewport.
 *  4. Finally both axes are clamped, so even a box larger than the free space never leaves the viewport's top-left
 *     edge (the box's own max-width/height then limit it).
 */
export type Side = 'top' | 'bottom' | 'left' | 'right'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Placement {
  left: number
  top: number
  side: Side
}

const OPPOSITE: Readonly<Record<Side, Side>> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left'
}

/** The default gap between trigger and tooltip and the minimum distance kept from the viewport edge (CSS px). */
export const FLOAT_GAP = 8
export const VIEWPORT_MARGIN = 8

/** Try order for a preferred side: preferred, opposite, then the perpendicular pair. */
export function sideOrder(preferred: Side): Side[] {
  const cross: Side[] =
    preferred === 'top' || preferred === 'bottom' ? ['bottom', 'top'] : ['right', 'left']
  const perpendicular: Side[] =
    preferred === 'top' || preferred === 'bottom' ? ['right', 'left'] : ['bottom', 'top']
  const first = [preferred, OPPOSITE[preferred]]
  return [...first, ...cross.filter((s) => !first.includes(s)), ...perpendicular]
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi))

export function placeFloating(opts: {
  anchor: Rect
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  preferred?: Side
  gap?: number
  margin?: number
}): Placement {
  const { anchor: a, size, viewport: vp } = opts
  const gap = opts.gap ?? FLOAT_GAP
  const m = opts.margin ?? VIEWPORT_MARGIN
  const room: Record<Side, number> = {
    top: a.top - gap - m,
    bottom: vp.height - (a.top + a.height) - gap - m,
    left: a.left - gap - m,
    right: vp.width - (a.left + a.width) - gap - m
  }
  const need = (s: Side): number => (s === 'top' || s === 'bottom' ? size.height : size.width)
  const order = sideOrder(opts.preferred ?? 'bottom')
  const side =
    order.find((s) => room[s] >= need(s)) ??
    order.reduce((best, s) => (room[s] > room[best] ? s : best), order[0]!)

  let left: number
  let top: number
  if (side === 'top' || side === 'bottom') {
    left = a.left + a.width / 2 - size.width / 2
    top = side === 'top' ? a.top - gap - size.height : a.top + a.height + gap
  } else {
    top = a.top + a.height / 2 - size.height / 2
    left = side === 'left' ? a.left - gap - size.width : a.left + a.width + gap
  }
  // Keep the whole box inside the viewport margin (the lower bound wins when the box is larger than the space).
  left = Math.max(m, clamp(left, m, vp.width - m - size.width))
  top = Math.max(m, clamp(top, m, vp.height - m - size.height))
  return { left: Math.round(left), top: Math.round(top), side }
}
