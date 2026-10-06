import { describe, expect, it } from 'vitest'
import {
  checkComposition,
  createSingleOutput,
  createTwoUpStripOutput,
  getOrientation,
  getPixelSize,
  getPrintPreset,
  inchesToPixels,
  PRINT_PRESET_IDS,
  resolveCompositionCells
} from '..'

describe('print math', () => {
  it.each([
    ['photo-4x6-portrait-300', 1200, 1800],
    ['photo-4x6-landscape-300', 1800, 1200],
    ['photo-4x6-portrait-600', 2400, 3600],
    ['photo-4x6-landscape-600', 3600, 2400],
    ['strip-2x6-300', 600, 1800],
    ['strip-2x6-600', 1200, 3600]
  ] as const)('%s → %i×%i px', (id, w, h) => {
    expect(getPixelSize(getPrintPreset(id))).toEqual({ width: w, height: h })
  })

  it('converts inches to pixels', () => {
    expect(inchesToPixels(4, 300)).toBe(1200)
    expect(inchesToPixels(6, 300)).toBe(1800)
    expect(inchesToPixels(4, 600)).toBe(2400)
    expect(inchesToPixels(6, 600)).toBe(3600)
    expect(inchesToPixels(3.3, 300)).toBe(990)
  })

  it('derives orientation', () => {
    expect(getOrientation(getPrintPreset('strip-2x6-600'))).toBe('portrait')
    expect(getOrientation(getPrintPreset('photo-4x6-landscape-300'))).toBe('landscape')
  })

  it('returns copies of presets', () => {
    const a = getPrintPreset('strip-2x6-600')
    a.dpi = 1
    expect(getPrintPreset('strip-2x6-600').dpi).toBe(600)
    expect(PRINT_PRESET_IDS).toHaveLength(6)
  })
})

describe('composition', () => {
  const strip = getPrintPreset('strip-2x6-600')

  it('accepts single-up', () => {
    expect(checkComposition(strip, createSingleOutput(strip))).toEqual([])
    expect(resolveCompositionCells(strip, createSingleOutput(strip))).toHaveLength(1)
  })

  it('accepts a two-up 2x6 strip on 4x6 and places two cells', () => {
    const out = createTwoUpStripOutput(strip)
    expect(out.print).toMatchObject({ width: 4, height: 6, dpi: 600 })
    expect(checkComposition(strip, out)).toEqual([])
    const cells = resolveCompositionCells(strip, out)
    expect(cells.map((c) => [c.x, c.y, c.width, c.height])).toEqual([
      [0, 0, 1200, 3600],
      [1200, 0, 1200, 3600]
    ])
  })

  it('centers a grid with a gap', () => {
    const out = {
      print: { ...strip, width: 5 },
      layout: { kind: 'grid', columns: 2, rows: 1, gap: 0.5 }
    } as const
    const cells = resolveCompositionCells(strip, out)
    // total = 2400 + 300 = 2700 of 3000 → origin 150
    expect(cells.map((c) => c.x)).toEqual([150, 1650])
  })

  it('rejects a design that does not fit', () => {
    const out = { print: strip, layout: { kind: 'grid', columns: 2, rows: 1, gap: 0 } } as const
    expect(checkComposition(strip, out).length).toBeGreaterThan(0)
  })

  it('rejects DPI mismatch and mismatched single-up', () => {
    const out300 = createTwoUpStripOutput(getPrintPreset('strip-2x6-300'))
    expect(checkComposition(strip, out300).some((p) => /DPI/.test(p.message))).toBe(true)
    const single = createSingleOutput(getPrintPreset('photo-4x6-portrait-600'))
    expect(checkComposition(strip, single).length).toBeGreaterThan(0)
  })
})
