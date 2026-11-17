import { describe, expect, it } from 'vitest'
import { formatSavedDate, templateId, toArgb } from '../profile'

describe('dslrBooth profile helpers', () => {
  it('converts domain hex colours to #AARRGGBB', () => {
    expect(toArgb('#ffffff')).toBe('#FFFFFFFF')
    expect(toArgb('#211f1f')).toBe('#FF211F1F')
    expect(toArgb('#11223380')).toBe('#80112233')
    expect(() => toArgb('red')).toThrow(RangeError)
  })

  it('formats LastSavedDate as MM/DD/YYYY HH:mm:ss local time', () => {
    expect(formatSavedDate(new Date(2023, 6, 27, 22, 26, 37))).toBe('07/27/2023 22:26:37')
    expect(formatSavedDate(new Date(2025, 0, 3, 4, 5, 6))).toBe('01/03/2025 04:05:06')
  })

  it('makes a stable 25-character alphanumeric Id per seed', () => {
    const a = templateId('proj-1:strip')
    expect(a).toMatch(/^[A-Za-z0-9]{25}$/)
    expect(templateId('proj-1:strip')).toBe(a)
    expect(templateId('proj-1:sheet')).not.toBe(a)
    expect(templateId('proj-2:strip')).not.toBe(a)
  })
})
