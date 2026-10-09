import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CROP,
  clampCornerRadius,
  clampCrop,
  clampFrameThickness,
  cropSlack,
  dragCrop,
  isDefaultCrop,
  placePhoto,
  zoomCrop
} from '../photoFit'

const landscapeBox = { width: 1049, height: 700 }
const portraitBox = { width: 700, height: 1049 }
const squareBox = { width: 800, height: 800 }
const covers = (
  p: ReturnType<typeof placePhoto>,
  box: { width: number; height: number }
): boolean =>
  p.dx <= 1e-9 &&
  p.dy <= 1e-9 &&
  p.dx + p.dw >= box.width - 1e-9 &&
  p.dy + p.dh >= box.height - 1e-9
const inside = (
  p: ReturnType<typeof placePhoto>,
  box: { width: number; height: number }
): boolean =>
  p.dx >= -1e-9 &&
  p.dy >= -1e-9 &&
  p.dx + p.dw <= box.width + 1e-9 &&
  p.dy + p.dh <= box.height + 1e-9

describe('cover / contain aspect-ratio matrix', () => {
  const cases: [string, { width: number; height: number }, { width: number; height: number }][] = [
    ['portrait picture → landscape frame', { width: 1200, height: 1800 }, landscapeBox],
    ['landscape picture → portrait frame', { width: 1800, height: 1200 }, portraitBox],
    ['square picture → portrait frame', { width: 1000, height: 1000 }, portraitBox],
    ['square picture → landscape frame', { width: 1000, height: 1000 }, landscapeBox],
    ['same aspect → same aspect', { width: 2098, height: 1400 }, landscapeBox]
  ]
  for (const [name, src, box] of cases) {
    it(`cover fills the whole frame, centred, aspect kept: ${name}`, () => {
      const p = placePhoto(src, box, 'cover')
      expect(covers(p, box)).toBe(true)
      expect(p.dw / p.dh).toBeCloseTo(src.width / src.height, 9)
      // centred on both axes
      expect(p.dx + p.dw / 2).toBeCloseTo(box.width / 2, 6)
      expect(p.dy + p.dh / 2).toBeCloseTo(box.height / 2, 6)
      // touches the frame on the tight axis
      expect(Math.min(p.dw - box.width, p.dh - box.height)).toBeCloseTo(0, 6)
    })
    it(`contain shows the whole picture inside the frame, centred: ${name}`, () => {
      const p = placePhoto(src, box, 'contain')
      expect(inside(p, box)).toBe(true)
      expect(p.dw / p.dh).toBeCloseTo(src.width / src.height, 9)
      expect(p.dx + p.dw / 2).toBeCloseTo(box.width / 2, 6)
      expect(p.dy + p.dh / 2).toBeCloseTo(box.height / 2, 6)
      expect(Math.max(p.dw - box.width, p.dh - box.height)).toBeCloseTo(0, 6)
    })
  }
  it('same aspect: cover and contain are identical and exactly fill the frame', () => {
    const src = { width: 2098, height: 1400 }
    const a = placePhoto(src, landscapeBox, 'cover')
    const b = placePhoto(src, landscapeBox, 'contain')
    expect(a.dw).toBeCloseTo(b.dw, 9)
    expect([a.dx, a.dy]).toEqual([0, 0].map((v) => expect.closeTo(v, 6)))
  })
  it('stretch ignores aspect and crop', () => {
    const p = placePhoto({ width: 100, height: 50 }, squareBox, 'stretch', { zoom: 3, x: 1, y: 1 })
    expect([p.dx, p.dy, p.dw, p.dh]).toEqual([0, 0, 800, 800])
  })
})

describe('crop: reposition', () => {
  const src = { width: 1800, height: 1200 }
  it('x/y = ±1 puts the picture flush with the frame edge, never beyond', () => {
    const left = placePhoto(src, portraitBox, 'cover', { zoom: 1, x: -1, y: 0 })
    expect(left.dx).toBeCloseTo(0, 9)
    const right = placePhoto(src, portraitBox, 'cover', { zoom: 1, x: 1, y: 0 })
    expect(right.dx + right.dw).toBeCloseTo(portraitBox.width, 9)
    expect(covers(left, portraitBox) && covers(right, portraitBox)).toBe(true)
  })
  it('an axis without slack cannot move (cover: tight axis)', () => {
    const p = placePhoto(src, portraitBox, 'cover', { zoom: 1, x: 0, y: 1 })
    expect(p.dy).toBeCloseTo(0, 9)
    expect(cropSlack(src, portraitBox, 'cover', 1).y).toBeCloseTo(0, 6)
  })
  it('drag math: dragging the picture right shows more of its left side; clamped; slackless axes ignored', () => {
    const slack = cropSlack(src, portraitBox, 'cover', 1)
    const c = dragCrop(DEFAULT_CROP, { x: slack.x / 4, y: 999 }, slack)
    expect(c.x).toBeCloseTo(-0.5, 9)
    expect(c.y).toBe(0)
    expect(dragCrop(DEFAULT_CROP, { x: 1e9, y: 0 }, slack).x).toBe(-1)
    expect(dragCrop(DEFAULT_CROP, { x: -1e9, y: 0 }, slack).x).toBe(1)
    // dragging by exactly the picture displacement reproduces the placement shift
    const before = placePhoto(src, portraitBox, 'cover', DEFAULT_CROP)
    const after = placePhoto(src, portraitBox, 'cover', c)
    expect(after.dx - before.dx).toBeCloseTo(slack.x / 4, 6)
  })
  it('contain with zoom 1 is centred and not draggable; zoom opens slack', () => {
    const s1 = cropSlack(src, portraitBox, 'contain', 1)
    expect(s1.x).toBeCloseTo(0, 6)
    expect(s1.y).toBeLessThan(0)
    const s2 = cropSlack(src, portraitBox, 'contain', 2)
    expect(s2.x).toBeGreaterThan(0)
  })
})

describe('crop: zoom and reset', () => {
  const src = { width: 1800, height: 1200 }
  it('zoom magnifies about the fit scale and stays covering', () => {
    const base = placePhoto(src, landscapeBox, 'cover', DEFAULT_CROP)
    const z2 = placePhoto(src, landscapeBox, 'cover', { zoom: 2, x: 0, y: 0 })
    expect(z2.dw / base.dw).toBeCloseTo(2, 9)
    expect(covers(z2, landscapeBox)).toBe(true)
  })
  it('zoom is clamped to 1…4 and non-finite input is sanitized', () => {
    expect(clampCrop({ zoom: 99, x: 5, y: -5 })).toEqual({ zoom: 4, x: 1, y: -1 })
    expect(clampCrop({ zoom: 0.2, x: NaN, y: 0 })).toEqual({ zoom: 1, x: 0, y: 0 })
  })
  it('zoomCrop keeps the picture point under the frame centre fixed', () => {
    const start = { zoom: 1.5, x: -0.4, y: 0.3 }
    const next = zoomCrop(start, 3, src, landscapeBox, 'cover')
    const centre = (c: typeof start): [number, number] => {
      const p = placePhoto(src, landscapeBox, 'cover', c)
      return [(landscapeBox.width / 2 - p.dx) / p.dw, (landscapeBox.height / 2 - p.dy) / p.dh]
    }
    expect(centre(next)[0]).toBeCloseTo(centre(start)[0], 6)
    expect(centre(next)[1]).toBeCloseTo(centre(start)[1], 6)
    expect(next.zoom).toBe(3)
  })
  it('reset (default crop) returns exactly the plain fit', () => {
    const plain = placePhoto(src, portraitBox, 'cover')
    const reset = placePhoto(src, portraitBox, 'cover', DEFAULT_CROP)
    expect(reset).toEqual(plain)
    expect(isDefaultCrop(DEFAULT_CROP)).toBe(true)
    expect(isDefaultCrop({ zoom: 1.1, x: 0, y: 0 })).toBe(false)
    expect(isDefaultCrop(undefined)).toBe(true)
  })
  it('the same crop yields the same placement for every copy (pure, no per-copy state)', () => {
    const crop = { zoom: 2, x: 0.25, y: -0.5 }
    expect(placePhoto(src, landscapeBox, 'cover', crop)).toEqual(
      placePhoto(src, landscapeBox, 'cover', crop)
    )
  })
})

describe('frame and corner clamps (design pixels, independent of DPI and zoom)', () => {
  it('radius 0, moderate, large and beyond half the shorter side', () => {
    expect(clampCornerRadius(0, 1049, 700)).toBe(0)
    expect(clampCornerRadius(60, 1049, 700)).toBe(60)
    expect(clampCornerRadius(350, 1049, 700)).toBe(350)
    expect(clampCornerRadius(9999, 1049, 700)).toBe(350)
    expect(clampCornerRadius(-5, 100, 100)).toBe(0)
  })
  it('a frame can never be thicker than half the shorter side', () => {
    expect(clampFrameThickness(12, 1049, 700)).toBe(12)
    expect(clampFrameThickness(9999, 1049, 700)).toBe(350)
    expect(clampFrameThickness(-1, 10, 10)).toBe(0)
  })
})
