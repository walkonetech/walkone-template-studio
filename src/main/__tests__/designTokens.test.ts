import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Design-token sanity: text/background pairs used by the UI meet WCAG AA, and spacing/typography stay on-scale. */
const css = readFileSync(join(__dirname, '../../renderer/src/styles/tokens.css'), 'utf8')
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!m?.[1]) throw new Error(`token --${name} is not a 6-digit hex colour`)
  return m[1]
}
const lum = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('design tokens', () => {
  const surfaces = ['c-app', 'c-panel', 'c-elevated', 'c-input', 'c-canvas-surround']
  it.each(surfaces)('primary and secondary text meet AA (4.5:1) on %s', (s) => {
    expect(contrast(token('c-text'), token(s))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('c-text-2'), token(s))).toBeGreaterThanOrEqual(4.5)
  })
  it.each(['c-app', 'c-panel', 'c-elevated'])('muted text meets AA on %s', (s) => {
    expect(contrast(token('c-text-3'), token(s))).toBeGreaterThanOrEqual(4.5)
  })
  it('label text is readable on panels but stays below secondary text; planned tools are visible yet distinct', () => {
    for (const surface of ['c-panel', 'c-elevated', 'c-app'])
      expect(contrast(token('c-text-label'), token(surface))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('c-text-label'), token('c-panel'))).toBeLessThan(
      contrast(token('c-text-2'), token('c-panel'))
    )
    expect(contrast(token('c-text-label'), token('c-panel'))).toBeGreaterThan(
      contrast(token('c-text-3'), token('c-panel'))
    )
    // Disabled rail tools: clearly present (>= 3:1) yet dimmer than the enabled label text.
    expect(contrast(token('c-text-faint'), token('c-app'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('c-text-faint'), token('c-app'))).toBeLessThan(
      contrast(token('c-text-2'), token('c-app'))
    )
  })
  it('accent button text, status colours and the focus ring are legible', () => {
    expect(contrast(token('c-on-accent'), token('c-accent'))).toBeGreaterThanOrEqual(4.5)
    for (const c of ['c-warning', 'c-error', 'c-success'])
      expect(contrast(token(c), token('c-panel'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('c-focus'), token('c-panel'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('c-focus'), token('c-canvas-surround'))).toBeGreaterThanOrEqual(3)
  })
  it('the accent is distinguishable from the panel (3:1) and selection is not colour-only', () => {
    expect(contrast(token('c-accent'), token('c-panel'))).toBeGreaterThanOrEqual(3)
    // Selected rows also get an accent edge bar and aria-selected; checked in the scripted run.
  })
  it('spacing, radius and type tokens are the documented scale', () => {
    const px = (name: string): number => Number(new RegExp(`--${name}:\\s*(\\d+)px`).exec(css)?.[1])
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => px(`sp-${n}`))).toEqual([4, 6, 8, 12, 16, 20, 24])
    expect([px('r-sm'), px('r-md'), px('r-lg')]).toEqual([4, 6, 10])
    for (const t of ['fs-body', 'fs-label', 'fs-input', 'fs-meta', 'fs-status', 'fs-tooltip'])
      expect(px(t)).toBeGreaterThanOrEqual(12) // no tiny text
  })
})
