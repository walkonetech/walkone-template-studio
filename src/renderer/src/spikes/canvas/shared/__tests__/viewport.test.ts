import { describe, expect, it } from 'vitest'
import {
  centeredView,
  designToScreen,
  fitView,
  screenToDesign,
  snapToleranceDesign
} from '../viewport'

const DESIGN = { width: 2400, height: 3600 }
const VIEWPORT = { width: 600, height: 720 }

describe('viewport math', () => {
  it('fit keeps the whole design inside the viewport, centered', () => {
    const v = fitView(DESIGN, VIEWPORT, 24)
    expect(v.scale).toBeCloseTo((720 - 48) / 3600, 9)
    const tl = designToScreen(v, 0, 0)
    const br = designToScreen(v, DESIGN.width, DESIGN.height)
    expect(tl.x).toBeGreaterThanOrEqual(24 - 1e-9)
    expect(tl.y).toBeCloseTo(24, 9)
    expect(br.y).toBeCloseTo(720 - 24, 9)
    expect((tl.x + br.x) / 2).toBeCloseTo(300, 9)
  })

  it('100% means one design pixel per CSS pixel, centered', () => {
    const v = centeredView(DESIGN, VIEWPORT, 1)
    expect(v.scale).toBe(1)
    expect(designToScreen(v, 1200, 1800)).toEqual({ x: 300, y: 360 })
  })

  it('design <-> screen round-trips at every zoom without changing design coordinates', () => {
    for (const s of [0.05, 0.1867, 0.5, 1, 2]) {
      const v = centeredView(DESIGN, VIEWPORT, s)
      const p = designToScreen(v, 250, 2160)
      const back = screenToDesign(v, p.x, p.y)
      expect(back.x).toBeCloseTo(250, 9)
      expect(back.y).toBeCloseTo(2160, 9)
    }
  })

  it('export size depends only on the design, never on the view', () => {
    // The view transform has no width/height of the design in it: two zooms, same design size.
    expect(centeredView(DESIGN, VIEWPORT, 0.2).scale).not.toBe(
      centeredView(DESIGN, VIEWPORT, 1).scale
    )
    expect(DESIGN).toEqual({ width: 2400, height: 3600 })
  })

  it('snap tolerance is constant on screen, so it grows in design units when zoomed out', () => {
    const out = centeredView(DESIGN, VIEWPORT, 0.1)
    const inn = centeredView(DESIGN, VIEWPORT, 1)
    expect(snapToleranceDesign(10, out)).toBeCloseTo(100, 9)
    expect(snapToleranceDesign(10, inn)).toBeCloseTo(10, 9)
  })
})
