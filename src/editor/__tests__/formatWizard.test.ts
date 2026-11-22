import { describe, expect, it } from 'vitest'
import { getPixelSize, inchesToPixels, toInches } from '@domain'
import {
  firstStepWithIssues,
  goBack,
  goNext,
  initialWizard,
  parseNumberField,
  setDpi,
  setMode,
  setOrientation,
  setRepeatGap,
  setRepeatMargin,
  setUnit,
  sheetDiagram,
  stepIssues,
  swapSize,
  wizardFormat,
  wizardFrom,
  type WizardState
} from '../formatWizard'

/** Phase 7B B5.5: the Custom Size wizard's pure state (no project is touched while browsing it). */

const px = (s: WizardState): [number, number] => [
  inchesToPixels(s.width, s.dpi),
  inchesToPixels(s.height, s.dpi)
]

describe('Custom Size wizard: size step', () => {
  it('starts at a sensible valid size with the recommended 3 mm safe margin and exact-size output', () => {
    const s = initialWizard()
    expect(s.step).toBe('size')
    expect(stepIssues(s)).toEqual([])
    expect(wizardFormat(s)).toMatchObject({ width: 2, height: 3, dpi: 300, safeMarginMm: 3 })
    expect(wizardFormat(s).arrangement).toEqual({ kind: 'exact' })
  })
  it('switching units never changes the stored size (no drift over many switches)', () => {
    let s = { ...initialWizard(), width: 2.25, height: 3.25 }
    for (let i = 0; i < 30; i++) s = setUnit(setUnit(setUnit(s, 'mm'), 'px'), 'in')
    expect([s.width, s.height]).toEqual([2.25, 3.25])
  })
  it('physical units: changing DPI keeps the physical size; the pixels follow', () => {
    const s = setDpi({ ...initialWizard(), width: 2.25, height: 3.25 }, 600)
    expect([s.width, s.height]).toEqual([2.25, 3.25])
    expect(px(s)).toEqual([1350, 1950])
  })
  it('pixel units: changing DPI keeps the entered pixels (DPI is print-size metadata)', () => {
    let s = setUnit(initialWizard(), 'px')
    s = { ...s, width: toInches(1080, 'px', 300), height: toInches(1350, 'px', 300) }
    expect(px(s)).toEqual([1080, 1350])
    s = setDpi(s, 600)
    expect(px(s)).toEqual([1080, 1350])
    expect(s.width).toBeCloseTo(1.8, 12)
    // the sheet is physical paper: a DPI change in a pixel format never resizes it
    expect([s.sheet.sheetWidth, s.sheet.sheetHeight]).toEqual([4, 6])
    s = setDpi(s, 72, 'custom')
    expect(px(s)).toEqual([1080, 1350])
    expect(s.dpiChoice).toBe('custom')
  })
  it('pixel units default to no generic physical safe margin; switching back restores the recommendation', () => {
    let s = setUnit(initialWizard(), 'px')
    expect(s.safe).toBe('none')
    s = setUnit(s, 'mm')
    expect(s.safe).toBe('recommended')
    // a deliberate choice is kept
    s = setUnit({ ...s, safe: 'custom', safeMm: 5 }, 'px')
    expect(s.safe).toBe('custom')
  })
  it('orientation: an explicit toggle swaps width and height (never contradictory)', () => {
    const p = initialWizard()
    const l = setOrientation(p, 'landscape')
    expect([l.width, l.height]).toEqual([3, 2])
    expect(setOrientation(l, 'landscape')).toBe(l)
    expect([setOrientation(l, 'portrait').width, setOrientation(l, 'portrait').height]).toEqual([
      2, 3
    ])
    const sq = { ...p, width: 3, height: 3 }
    expect(setOrientation(sq, 'landscape')).toBe(sq)
    expect(swapSize(p)).toMatchObject({ width: 3, height: 2 })
  })
  it('a step with a problem cannot go Next; the problem is reported on its field', () => {
    const s = { ...initialWizard(), width: Number.NaN }
    expect(stepIssues(s).map((i) => i.field)).toEqual(['width'])
    expect(goNext(s)).toBe(s)
    expect(firstStepWithIssues(s)).toBe('size')
  })
  it('number fields accept "2.25", " 50 ", "2,25"; anything else is NaN', () => {
    expect(parseNumberField('2.25')).toBe(2.25)
    expect(parseNumberField(' 50 ')).toBe(50)
    expect(parseNumberField('2,25')).toBe(2.25)
    expect(parseNumberField('.5')).toBe(0.5)
    for (const bad of ['', 'abc', '1e3', '2.2.5', '--1']) expect(parseNumberField(bad)).toBeNaN()
  })
})

describe('Custom Size wizard: output, safe margin, review', () => {
  const magnet = (): WizardState => setMode({ ...initialWizard(), step: 'output' }, 'repeat')
  it('repeat on a sheet: 2 × 2 on 4 × 6 by default, valid, four copies at exact design size', () => {
    const s = magnet()
    expect(stepIssues(s)).toEqual([])
    const d = sheetDiagram(s)
    expect(d.sheet).toEqual({ width: 4, height: 6 })
    expect(d.copies).toEqual([
      { x: 0, y: 0, width: 2, height: 3 },
      { x: 2, y: 0, width: 2, height: 3 },
      { x: 0, y: 3, width: 2, height: 3 },
      { x: 2, y: 3, width: 2, height: 3 }
    ])
  })
  it('repeat uses one gap and one margin; custom keeps every value', () => {
    let s = setRepeatMargin(setRepeatGap(magnet(), 0.1), 0.2)
    expect(s.sheet.columnGap).toBe(0.1)
    expect(s.sheet.rowGap).toBe(0.1)
    expect(s.sheet.margins).toEqual({ top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 })
    s = setMode({ ...s, sheet: { ...s.sheet, rowGap: 0.3 } }, 'custom')
    expect(s.sheet.rowGap).toBe(0.3)
    // switching back to repeat evens them out again
    expect(setMode(s, 'repeat').sheet.rowGap).toBe(0.1)
  })
  it('D — an arrangement that does not fit blocks Next and Create', () => {
    const s = { ...magnet(), width: 3, height: 4 }
    expect(stepIssues(s).map((i) => i.field)).toEqual(['fit'])
    expect(goNext(s)).toBe(s)
    expect(firstStepWithIssues({ ...s, step: 'review' })).toBe('output')
  })
  it('generic safe margin: none, recommended 3 mm, or custom', () => {
    const s = initialWizard()
    expect(wizardFormat({ ...s, safe: 'none' }).safeMarginMm).toBeNull()
    expect(wizardFormat(s).safeMarginMm).toBe(3)
    expect(wizardFormat({ ...s, safe: 'custom', safeMm: 4.5 }).safeMarginMm).toBe(4.5)
    expect(
      stepIssues({ ...s, step: 'safe', safe: 'custom', safeMm: -2 }).map((i) => i.field)
    ).toEqual(['safeMargin'])
  })
  it('steps go forward and back in order', () => {
    let s = initialWizard()
    s = goNext(s)
    expect(s.step).toBe('output')
    s = goNext(goNext(s))
    expect(s.step).toBe('review')
    expect(goNext(s).step).toBe('review')
    expect(goBack(goBack(s)).step).toBe('output')
  })
  it('a saved format round-trips into the wizard (opens on Review) and back', () => {
    const s = setRepeatGap(magnet(), 0.05)
    const f = { ...wizardFormat(s), name: '2×3 Magnet' }
    const back = wizardFrom(f)
    expect(back.step).toBe('review')
    expect(wizardFormat(back)).toEqual(f)
    const exact = wizardFrom({ ...f, arrangement: { kind: 'exact' }, safeMarginMm: 4 })
    expect(exact.mode).toBe('exact')
    expect(exact.safe).toBe('custom')
  })
  it('the wizard never creates or touches a project by itself (pure state only)', () => {
    const s = initialWizard()
    const f = wizardFormat(s)
    expect(f).not.toHaveProperty('layers')
    expect(getPixelSize({ width: f.width, height: f.height, unit: 'in', dpi: f.dpi })).toEqual({
      width: 600,
      height: 900
    })
  })
})
