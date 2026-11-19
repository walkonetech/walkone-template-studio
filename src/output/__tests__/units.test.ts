import { describe, expect, it } from 'vitest'
import { formatMm, inchesToMm, inchesToPx, mmToInches, mmToPx, pxToMm } from '../units'

describe('physical units → design pixels', () => {
  it('converts millimetres to pixels at 300 DPI (3 mm ≈ 35.43 px, 1 in = 300 px)', () => {
    expect(mmToPx(3, 300)).toBeCloseTo(35.433, 3)
    expect(mmToPx(25.4, 300)).toBe(300)
    expect(mmToPx(1.8, 300)).toBeCloseTo(21.26, 2)
  })

  it('converts millimetres to pixels at 600 DPI: exactly twice the 300 DPI value', () => {
    expect(mmToPx(3, 600)).toBeCloseTo(70.866, 3)
    expect(mmToPx(25.4, 600)).toBe(600)
    for (const mm of [0.5, 1.6, 1.8, 3, 10])
      expect(mmToPx(mm, 600)).toBeCloseTo(2 * mmToPx(mm, 300), 9)
  })

  it('works for any DPI and round-trips without rounding', () => {
    for (const dpi of [72, 150, 300, 350, 600, 1200]) {
      expect(pxToMm(mmToPx(3, dpi), dpi)).toBeCloseTo(3, 12)
      expect(inchesToPx(2, dpi)).toBe(2 * dpi)
    }
    expect(mmToInches(inchesToMm(4))).toBeCloseTo(4, 12)
    expect(inchesToMm(6)).toBeCloseTo(152.4, 9)
  })

  it('formats millimetres for messages with one decimal', () => {
    expect(formatMm(1.234)).toBe('1.2 mm')
    expect(formatMm(3)).toBe('3 mm')
    expect(formatMm(-0.01)).toBe('0 mm')
  })
})
