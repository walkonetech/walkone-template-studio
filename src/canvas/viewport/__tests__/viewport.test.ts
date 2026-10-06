import { describe, expect, it } from 'vitest'
import {
  centeredView,
  clampScale,
  designToScreen,
  fitView,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  resolveView,
  screenToDesign,
  snapToleranceDesign,
  toManual,
  zoomAt,
  zoomStep
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

describe('view state and zoom operations', () => {
  const design = { width: 2400, height: 3600 }
  const viewport = { width: 500, height: 750 }

  it('fit mode follows the viewport; manual mode is explicit and clamped', () => {
    const fit = resolveView({ mode: 'fit' }, design, viewport)
    expect(fit).toEqual(fitView(design, viewport, 24))
    expect(
      resolveView({ mode: 'manual', scale: 100, offsetX: 1, offsetY: 2 }, design, viewport).scale
    ).toBe(MAX_SCALE)
    expect(
      resolveView({ mode: 'manual', scale: 0, offsetX: 1, offsetY: 2 }, design, viewport).scale
    ).toBe(MIN_SCALE)
  })

  it('zoomAt keeps the design point under the anchor fixed', () => {
    const v = fitView(design, viewport)
    const anchor = { x: 120, y: 300 }
    const before = screenToDesign(v, anchor.x, anchor.y)
    const z = zoomAt(v, 2, anchor)
    const after = screenToDesign(z, anchor.x, anchor.y)
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
    expect(z.scale).toBeCloseTo(v.scale * 2, 9)
  })

  it('zoom is clamped at both ends and never changes design coordinates', () => {
    let v = fitView(design, viewport)
    for (let i = 0; i < 60; i++) v = zoomStep(v, 1, viewport)
    expect(v.scale).toBe(MAX_SCALE)
    for (let i = 0; i < 120; i++) v = zoomStep(v, -1, viewport)
    expect(v.scale).toBe(MIN_SCALE)
    // a design point maps to screen and back identically at the extremes
    const p = designToScreen(v, 250, 2160)
    expect(screenToDesign(v, p.x, p.y).x).toBeCloseTo(250, 6)
  })

  it('pan moves the offset only', () => {
    const v = fitView(design, viewport)
    const p = panBy(v, 10, -20)
    expect(p.scale).toBe(v.scale)
    expect(p.offsetX).toBe(v.offsetX + 10)
    expect(p.offsetY).toBe(v.offsetY - 20)
    expect(toManual(p)).toMatchObject({ mode: 'manual', scale: v.scale })
  })

  it('clampScale bounds', () => {
    expect(clampScale(0.001)).toBe(MIN_SCALE)
    expect(clampScale(9)).toBe(MAX_SCALE)
    expect(clampScale(1)).toBe(1)
  })

  it('works in CSS pixels: the same design point lands on the same screen point for any device pixel ratio', () => {
    // devicePixelRatio only changes the canvas backing store (CSS size × ratio), never these coordinates.
    const v = centeredView(design, viewport, 0.2)
    const css = designToScreen(v, 1200, 1800)
    for (const dpr of [1, 2, 3]) {
      const backing = { x: css.x * dpr, y: css.y * dpr }
      expect(backing.x / dpr).toBeCloseTo(css.x, 9)
    }
    expect(screenToDesign(v, css.x, css.y)).toEqual({ x: 1200, y: 1800 })
  })
})
