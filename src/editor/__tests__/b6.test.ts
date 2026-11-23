import { describe, expect, it } from 'vitest'
import { createProject } from '@domain'
import { describeCanvasForScreenReader } from '../describe'
import { arrangementInWords, initialWizard, setMode, type WizardState } from '../formatWizard'
import { placeToolbar } from '../selectionToolbar'

describe('B6 canvas text equivalent', () => {
  const strip = createProject({ name: 'Strip', design: 'strip-2x6-600' })
  it('names the mode, the format, copies, layers and the selection', () => {
    const t = describeCanvasForScreenReader(strip, 'design', [])
    expect(t).toMatch(
      /^Design\. 2×6 Strip, 600 DPI, Design 1200×3600 px\. 2 copies per sheet\. 0 layers\./
    )
    expect(t).toMatch(/Nothing selected/)
    expect(
      describeCanvasForScreenReader(strip, 'design', [{ name: 'Title', type: 'Text' }])
    ).toMatch(/Selected: Text “Title”/)
    expect(
      describeCanvasForScreenReader(strip, 'design', [
        { name: 'A', type: 'Text' },
        { name: 'B', type: 'Photo' }
      ])
    ).toMatch(/2 layers selected/)
  })
  it('Print Preview says read only and does not talk about selection', () => {
    const t = describeCanvasForScreenReader(strip, 'preview', [{ name: 'Title', type: 'Text' }])
    expect(t).toMatch(/^Print Preview, read only\. 4×6 Output, 2-up/)
    expect(t).not.toMatch(/Selected/)
  })
})

describe('B6 arrangement in words (the diagram’s text equivalent)', () => {
  const repeat = (patch: Partial<WizardState['sheet']> = {}): WizardState => {
    const s = setMode(initialWizard(), 'custom')
    return { ...s, sheet: { ...s.sheet, ...patch } }
  }
  it('exact size', () => {
    expect(arrangementInWords(initialWizard())).toBe('Prints one copy at exactly the design size.')
  })
  it('copies, sheet, margins and placement', () => {
    expect(
      arrangementInWords(
        repeat({ margins: { top: 0.5, right: 0, bottom: 0, left: 0.25 }, align: 'start' })
      )
    ).toBe(
      '2 copies across by 2 down on a 4 by 6 inch sheet. Top margin 0.5 in, left margin 0.25 in. Placed from the top-left margin.'
    )
    expect(arrangementInWords(repeat({ columnGap: 0.1, rowGap: 0.1 }))).toMatch(
      /Gap 0\.1 in between copies\. Centred on the sheet\.$/
    )
    expect(
      arrangementInWords(repeat({ margins: { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 } }))
    ).toMatch(/Margin 0\.2 in on every side\./)
  })
  it('millimetres when the wizard uses millimetres', () => {
    const s = { ...repeat(), unit: 'mm' as const }
    expect(arrangementInWords(s)).toMatch(/on a 101\.6 by 152\.4 mm sheet/)
  })
})

describe('B6 selection toolbar never covers the getting-started tips', () => {
  const host = { width: 1000, height: 700 }
  const size = { width: 300, height: 40 }
  it('keeps the usual place when it is clear', () => {
    const sel = { left: 100, top: 300, width: 200, height: 100 }
    const tips = { left: 700, top: 100, width: 280, height: 300 }
    expect(placeToolbar({ selection: sel, size, host, avoid: [tips] })).toEqual(
      placeToolbar({ selection: sel, size, host })
    )
  })
  it('moves to another side, or slides along, instead of covering the card', () => {
    const tips = { left: 560, top: 100, width: 280, height: 300 }
    const sel = { left: 500, top: 260, width: 200, height: 100 }
    const usual = placeToolbar({ selection: sel, size, host })
    const hit = (p: { left: number; top: number }): boolean =>
      p.left < tips.left + tips.width &&
      tips.left < p.left + size.width &&
      p.top < tips.top + tips.height &&
      tips.top < p.top + size.height
    expect(hit(usual)).toBe(true)
    const p = placeToolbar({ selection: sel, size, host, avoid: [tips] })
    expect(hit(p)).toBe(false)
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.left + size.width).toBeLessThanOrEqual(host.width - 8)
    expect(p.top).toBeGreaterThanOrEqual(8)
  })
})
