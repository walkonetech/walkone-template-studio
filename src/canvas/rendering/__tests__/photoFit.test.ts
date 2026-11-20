import { describe, expect, it } from 'vitest'
import { clampCornerRadius, clampFrameThickness } from '../photoFit'

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
