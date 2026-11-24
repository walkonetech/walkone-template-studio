import { describe, expect, it } from 'vitest'
import {
  checkProjectIntegrity,
  createProjectFromFormat,
  deserializeProject,
  fileSchemaVersion,
  getPixelSize,
  serializeProject,
  type FormatDefinition,
  type PhotoLayer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import {
  GUIDE_STEPS,
  LAYOUTS_FOR,
  PHOTO_COUNTS,
  applyGuide,
  canOpenInEditor,
  effectiveLayout,
  guideBack,
  guideFormat,
  guideIssues,
  guideMargin,
  guideNext,
  guidePhotoRects,
  guideSummary,
  guideTextPlacements,
  initialGuide,
  recommendedLayout,
  type GuideAnswers
} from '../designGuide'
import { createNewLayer } from '../newLayers'

const T0 = '2026-01-01T00:00:00.000Z'
const ids = (): (() => string) => {
  let n = 0
  return () => `id-${++n}`
}
const empty = (f: FormatDefinition): TemplateProject =>
  createProjectFromFormat(f, { name: 'Starter', now: T0, createId: () => 'project-id' })

function build(a: GuideAnswers): TemplateProject {
  const f = guideFormat(a)!
  return applyGuide(empty(f), a, { now: T0, createId: ids() })
}

const withText = (a: GuideAnswers, title = 'Sam & Alex'): GuideAnswers => ({
  ...a,
  text: { ...a.text, title: { on: true, value: title } }
})

const magnet: FormatDefinition = {
  name: 'Magnet 2×3',
  width: 2,
  height: 3,
  dpi: 300,
  unit: 'in',
  arrangement: {
    kind: 'repeat',
    sheetWidth: 4,
    sheetHeight: 6,
    columns: 2,
    rows: 2,
    columnGap: 0,
    rowGap: 0,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    align: 'center'
  },
  safeMarginMm: 3,
  cutGuides: true
}

const inside = (
  r: { x: number; y: number; width: number; height: number },
  W: number,
  H: number,
  m: number
): boolean => r.x >= m && r.y >= m && r.x + r.width <= W - m && r.y + r.height <= H - m

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

describe('Design Guide (7C): steps and answers', () => {
  it('has five steps in order and Back/Next stay inside them', () => {
    expect(GUIDE_STEPS).toEqual(['format', 'photos', 'style', 'text', 'review'])
    expect(guideNext('review')).toBe('review')
    expect(guideBack('format')).toBe('format')
    expect(guideNext('photos')).toBe('style')
  })

  it('maps the built-in choices onto the existing built-in formats (no second format model)', () => {
    const a = initialGuide()
    expect(guideFormat(a)!.name).toBe('2×6 Strip')
    expect(guideFormat({ ...a, formatChoice: 'portrait' })!.name).toBe('4×6 Portrait')
    expect(guideFormat({ ...a, formatChoice: 'landscape', dpi: 300 })!.dpi).toBe(300)
    expect(guideFormat({ ...a, formatChoice: 'custom' })).toBeNull()
    expect(guideFormat({ ...a, formatChoice: 'custom', customFormat: magnet })).toBe(magnet)
  })

  it('blocks only a missing custom size and turned-on text that is empty', () => {
    const a = initialGuide()
    expect(guideIssues({ ...a, formatChoice: 'custom' }, 'format')[0]!.field).toBe('format')
    expect(canOpenInEditor({ ...a, formatChoice: 'custom' })).toBe(false)
    expect(guideIssues(a, 'text').map((i) => i.field)).toEqual(['text-title'])
    expect(guideIssues(withText(a), 'text')).toEqual([])
    expect(guideIssues(a, 'photos')).toEqual([])
  })
})

describe('Design Guide (7C): photo layouts', () => {
  const strip = { width: 1200, height: 3600 }
  const portrait = { width: 2400, height: 3600 }
  const landscape = { width: 3600, height: 2400 }

  it('recommends stacks on strips, side by side on wide designs and a grid otherwise', () => {
    expect(recommendedLayout(3, strip)).toBe('3-stacked')
    expect(recommendedLayout(4, strip)).toBe('4-stacked')
    expect(recommendedLayout(2, portrait)).toBe('2-stacked')
    expect(recommendedLayout(2, landscape)).toBe('2-side')
    expect(recommendedLayout(3, portrait)).toBe('3-feature')
    expect(recommendedLayout(4, portrait)).toBe('4-grid')
  })

  it('a layout chosen for another count falls back to the recommendation', () => {
    const a = { ...initialGuide(), photoCount: 2 as const, layout: '4-grid' as const }
    expect(effectiveLayout(a, strip)).toBe('2-stacked')
  })

  const formats: [string, GuideAnswers['formatChoice']][] = [
    ['strip', 'strip'],
    ['portrait', 'portrait'],
    ['landscape', 'landscape']
  ]
  for (const [label, choice] of formats) {
    for (const count of PHOTO_COUNTS) {
      for (const layout of LAYOUTS_FOR[count]) {
        it(`${label} · ${layout}: slots inside the margin, separate, camera-shaped`, () => {
          const a = withText({ ...initialGuide(), formatChoice: choice, photoCount: count, layout })
          const f = guideFormat(a)!
          const { width: W, height: H } = getPixelSize({
            width: f.width,
            height: f.height,
            unit: 'in',
            dpi: f.dpi
          })
          const m = guideMargin({ width: W, height: H, safePx: 0 })
          const rects = guidePhotoRects(a, f)
          expect(rects).toHaveLength(count)
          for (const r of rects) {
            expect(Number.isInteger(r.x) && Number.isInteger(r.width)).toBe(true)
            expect(inside(r, W, H, m - 1)).toBe(true)
            const ratio = r.width / r.height
            expect([2 / 3, 3 / 2].some((x) => Math.abs(ratio - x) < 0.02)).toBe(true)
          }
          for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++)
              expect(overlaps(rects[i]!, rects[j]!)).toBe(false)
        })
      }
    }
  }

  it('explicit shapes are honoured (square, portrait, landscape)', () => {
    const base = withText({
      ...initialGuide(),
      formatChoice: 'portrait' as const,
      photoCount: 2 as const
    })
    const f = guideFormat(base)!
    for (const [shape, ratio] of [
      ['square', 1],
      ['portrait', 2 / 3],
      ['landscape', 3 / 2]
    ] as const) {
      for (const r of guidePhotoRects({ ...base, shape }, f))
        expect(Math.abs(r.width / r.height - ratio)).toBeLessThan(0.02)
    }
  })

  it('photos stay clear of a generic safe margin and of the text band', () => {
    const a = withText({
      ...initialGuide(),
      formatChoice: 'custom' as const,
      customFormat: magnet,
      photoCount: 1 as const
    })
    const rects = guidePhotoRects(a, magnet)
    const safePx = Math.round((3 / 25.4) * 300)
    expect(rects.every((r) => inside(r, 600, 900, safePx + 1))).toBe(true)
    const text = guideTextPlacements(a, magnet)
    expect(text).toHaveLength(1)
    expect(overlaps(rects[0]!, text[0]!.rect)).toBe(false)
    expect(inside(text[0]!.rect, 600, 900, safePx + 1)).toBe(true)
  })

  it('photos use the whole area when every text line is off', () => {
    const on = withText(initialGuide())
    const off = { ...on, text: { ...on.text, title: { on: false, value: 'x' } } }
    const f = guideFormat(on)!
    const h = (a: GuideAnswers): number => guidePhotoRects(a, f).reduce((s, r) => s + r.height, 0)
    expect(h(off)).toBeGreaterThan(h(on))
  })
})

describe('Design Guide (7C): applying the answers', () => {
  it("creates normal numbered photo slots with the editor's own defaults", () => {
    const p = build(withText(initialGuide()))
    const photos = p.layers.filter((l): l is PhotoLayer => l.type === 'photo')
    expect(photos.map((l) => l.photoNumber)).toEqual([1, 2, 3])
    expect(photos.map((l) => l.name)).toEqual(['Photo 1', 'Photo 2', 'Photo 3'])
    const reference = createNewLayer(
      empty(guideFormat(initialGuide())!),
      'photo',
      () => 'x'
    ) as PhotoLayer
    for (const l of photos) {
      expect(l.fit).toBe(reference.fit)
      expect(l.sampleAssetId).toBeUndefined()
      expect(l.rotation).toBe(0)
      expect(l.visible && !l.locked).toBe(true)
    }
  })

  it('writes the chosen colours as the Event Palette and links background, text and frames to it', () => {
    const a = withText({
      ...initialGuide(),
      colors: { background: '#101010', accent: '#ff0000', text: '#fafafa' }
    })
    const p = build(a)
    const byRole = Object.fromEntries(p.palette.colors.map((c) => [c.role, c]))
    expect(byRole.background!.value).toBe('#101010')
    expect(byRole.accent!.value).toBe('#ff0000')
    expect(byRole.text!.value).toBe('#fafafa')
    expect(p.canvas.backgroundColor).toEqual({
      kind: 'palette',
      paletteColorId: byRole.background!.id
    })
    const photo = p.layers.find((l): l is PhotoLayer => l.type === 'photo')!
    expect(photo.frame).toMatchObject({
      style: 'solid',
      color: { kind: 'palette', paletteColorId: byRole.accent!.id }
    })
    const text = p.layers.find((l): l is TextLayer => l.type === 'text')!
    expect(text.fill).toEqual({ kind: 'palette', paletteColorId: byRole.text!.id })
  })

  it("frame and corner choices map onto the photo slot's own fields", () => {
    const none = build({ ...initialGuide(), frame: 'none' })
    expect(none.layers.every((l) => l.type !== 'photo' || l.frame.style === 'none')).toBe(true)
    const thin = build(initialGuide()).layers.find((l): l is PhotoLayer => l.type === 'photo')!
    const thick = build({
      ...initialGuide(),
      frame: 'thick',
      frameColor: 'white',
      corners: 'rounded'
    }).layers.find((l): l is PhotoLayer => l.type === 'photo')!
    expect(thin.frame.style === 'solid' && thick.frame.style === 'solid').toBe(true)
    if (thin.frame.style === 'solid' && thick.frame.style === 'solid') {
      expect(thick.frame.thickness).toBeGreaterThan(thin.frame.thickness)
      expect(thick.frame.color).toEqual({ kind: 'literal', value: '#ffffff' })
    }
    expect(thin.cornerRadius).toBe(0)
    expect(thick.cornerRadius).toBeGreaterThan(0)
  })

  it('creates one normal text layer per filled-in line, on top of the photos', () => {
    const a: GuideAnswers = {
      ...initialGuide(),
      text: {
        title: { on: true, value: 'Sam & Alex' },
        date: { on: true, value: 'June 14, 2027' },
        message: { on: true, value: '' }
      },
      font: 'Georgia',
      align: 'left'
    }
    const p = build(a)
    const texts = p.layers.filter((l): l is TextLayer => l.type === 'text')
    expect(texts.map((t) => [t.name, t.content])).toEqual([
      ['Event name', 'Sam & Alex'],
      ['Date', 'June 14, 2027']
    ])
    expect(texts.every((t) => t.fontFamily === 'Georgia' && t.align === 'left')).toBe(true)
    expect(texts[0]!.fontWeight).toBe(700)
    expect(texts[0]!.fontSize).toBeGreaterThan(texts[1]!.fontSize)
    expect(texts[0]!.y + texts[0]!.height).toBeLessThanOrEqual(texts[1]!.y)
    const topPhoto = Math.max(...p.layers.filter((l) => l.type === 'photo').map((l) => l.zIndex))
    expect(texts.every((t) => t.zIndex > topPhoto)).toBe(true)
  })

  it('a long line starts smaller so it fits the band on one line (no new overflow model)', () => {
    const measure = (text: string, _f: string, size: number): number => text.length * size * 0.6
    const f = guideFormat(initialGuide())!
    const short = guideTextPlacements(withText(initialGuide(), 'Sam'), f, measure)[0]!
    const long = guideTextPlacements(
      withText(initialGuide(), 'The Wonderful Wedding of Samantha'),
      f,
      measure
    )[0]!
    expect(long.fontSize).toBeLessThan(short.fontSize)
    expect(measure(long.content, '', long.fontSize)).toBeLessThanOrEqual(long.rect.width)
  })

  it('is deterministic and never duplicates layers however often it is applied', () => {
    const a = withText(initialGuide())
    const once = build(a)
    expect(build(a)).toEqual(once)
    // Re-applying to the same EMPTY project after changing answers back and forth gives the same result.
    const changed = build({ ...a, photoCount: 1 })
    expect(changed.layers.filter((l) => l.type === 'photo')).toHaveLength(1)
    expect(build(a)).toEqual(once)
    expect(once.layers).toHaveLength(4)
  })

  it('the result is a valid project with no Guide data and the same schema version as a blank one', () => {
    for (const a of [
      withText(initialGuide()),
      withText({ ...initialGuide(), formatChoice: 'portrait' as const, photoCount: 1 as const }),
      withText({ ...initialGuide(), formatChoice: 'custom' as const, customFormat: magnet })
    ]) {
      const blank = empty(guideFormat(a)!)
      const p = build(a)
      expect(checkProjectIntegrity(p)).toEqual([])
      expect(fileSchemaVersion(p)).toBe(fileSchemaVersion(blank))
      const back = deserializeProject(serializeProject(p))
      expect(back.ok).toBe(true)
      const json = serializeProject(p)
      expect(json).not.toMatch(/guide/i)
      expect(Object.keys(p).sort()).toEqual(Object.keys(blank).sort())
      expect(p.event).toEqual({})
    }
  })

  it('summarises the answers in operator words', () => {
    const s = guideSummary(withText(initialGuide()))!
    expect(s.format.name).toBe('2×6 Strip')
    expect(s.photos).toBe('3 photos · Stacked · shape chosen automatically')
    expect(s.text).toBe('Event name: “Sam & Alex”')
    expect(guideSummary({ ...initialGuide(), formatChoice: 'custom' })).toBeNull()
  })
})
