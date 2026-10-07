import { describe, expect, it } from 'vitest'
import { getPrintPreset } from '@domain'
import { describePrint } from '../describe'

describe('describePrint', () => {
  it('summarizes physical size, orientation, DPI and pixels', () => {
    expect(describePrint(getPrintPreset('photo-4x6-portrait-600'))).toBe(
      '4×6 Portrait • 600 DPI • 2400×3600 px'
    )
    expect(describePrint(getPrintPreset('photo-4x6-landscape-300'))).toBe(
      '6×4 Landscape • 300 DPI • 1800×1200 px'
    )
    expect(describePrint(getPrintPreset('strip-2x6-600'))).toBe(
      '2×6 Portrait • 600 DPI • 1200×3600 px'
    )
    expect(describePrint({ width: 5, height: 5, unit: 'in', dpi: 300 })).toBe(
      '5×5 Square • 300 DPI • 1500×1500 px'
    )
  })
})
