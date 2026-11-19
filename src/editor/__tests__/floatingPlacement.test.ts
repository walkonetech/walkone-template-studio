import { describe, expect, it } from 'vitest'
import { VIEWPORT_MARGIN, placeFloating, sideOrder, type Placement } from '../floatingPlacement'

const VP = { width: 1426, height: 779 }
const TIP = { width: 260, height: 48 }
const inside = (p: Placement, size = TIP, vp = VP): boolean =>
  p.left >= VIEWPORT_MARGIN &&
  p.top >= VIEWPORT_MARGIN &&
  p.left + size.width <= vp.width - VIEWPORT_MARGIN &&
  p.top + size.height <= vp.height - VIEWPORT_MARGIN
const btn = (left: number, top: number) => ({ left, top, width: 28, height: 28 })

describe('floating placement keeps tooltips inside the viewport', () => {
  it('try order: preferred, opposite, then the perpendicular sides', () => {
    expect(sideOrder('bottom')).toEqual(['bottom', 'top', 'right', 'left'])
    expect(sideOrder('right')).toEqual(['right', 'left', 'bottom', 'top'])
  })

  it('keeps the preferred side when it fits, centred on the trigger', () => {
    const p = placeFloating({ anchor: btn(600, 100), size: TIP, viewport: VP, preferred: 'bottom' })
    expect(p.side).toBe('bottom')
    expect(p.top).toBe(100 + 28 + 8)
    expect(p.left).toBe(Math.round(614 - 130))
    expect(inside(p)).toBe(true)
  })

  it('right edge (Layers help button): shifts left so nothing is clipped, still below its trigger', () => {
    const p = placeFloating({ anchor: btn(1390, 90), size: TIP, viewport: VP, preferred: 'bottom' })
    expect(p.side).toBe('bottom')
    expect(p.left + TIP.width).toBe(VP.width - VIEWPORT_MARGIN)
    expect(inside(p)).toBe(true)
  })

  it('right edge with a preferred "right" side flips to the left', () => {
    const p = placeFloating({ anchor: btn(1380, 300), size: TIP, viewport: VP, preferred: 'right' })
    expect(p.side).toBe('left')
    expect(p.left + TIP.width).toBe(1380 - 8)
    expect(inside(p)).toBe(true)
  })

  it('left edge: a centred tooltip is shifted right; a preferred "left" side flips to the right', () => {
    const a = placeFloating({ anchor: btn(4, 300), size: TIP, viewport: VP, preferred: 'bottom' })
    expect(a.left).toBe(VIEWPORT_MARGIN)
    expect(inside(a)).toBe(true)
    const b = placeFloating({ anchor: btn(4, 300), size: TIP, viewport: VP, preferred: 'left' })
    expect(b.side).toBe('right')
    expect(inside(b)).toBe(true)
  })

  it('top edge: a preferred "top" side flips below', () => {
    const p = placeFloating({ anchor: btn(600, 4), size: TIP, viewport: VP, preferred: 'top' })
    expect(p.side).toBe('bottom')
    expect(inside(p)).toBe(true)
  })

  it('bottom edge (status bar): the default "bottom" side flips above', () => {
    const p = placeFloating({
      anchor: btn(1300, 755),
      size: TIP,
      viewport: VP,
      preferred: 'bottom'
    })
    expect(p.side).toBe('top')
    expect(p.top + TIP.height).toBe(755 - 8)
    expect(inside(p)).toBe(true)
  })

  it('corners: bottom-right and top-left stay inside', () => {
    for (const [x, y] of [
      [1398, 751],
      [0, 0],
      [1398, 0],
      [0, 751]
    ] as const)
      for (const pref of ['top', 'bottom', 'left', 'right'] as const)
        expect(
          inside(placeFloating({ anchor: btn(x, y), size: TIP, viewport: VP, preferred: pref })),
          `${x},${y},${pref}`
        ).toBe(true)
  })

  it('small window (1100×650) and a tall wrapped tooltip still fit', () => {
    const vp = { width: 1100, height: 650 }
    const tall = { width: 260, height: 140 }
    for (const a of [btn(1080, 60), btn(1080, 620), btn(2, 620), btn(540, 2)])
      expect(inside(placeFloating({ anchor: a, size: tall, viewport: vp }), tall, vp)).toBe(true)
  })

  it('when no side fits, the box uses the roomiest side and never leaves the top-left margin', () => {
    const vp = { width: 300, height: 120 }
    const big = { width: 400, height: 200 }
    const p = placeFloating({ anchor: btn(150, 50), size: big, viewport: vp })
    expect(p.left).toBe(VIEWPORT_MARGIN)
    expect(p.top).toBe(VIEWPORT_MARGIN)
  })
})
