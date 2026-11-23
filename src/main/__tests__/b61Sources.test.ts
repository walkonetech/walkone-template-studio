import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Phase 7B B6.1: Windows closure follow-ups (native picker focus, High Contrast text, physical focus-ring width). */

const root = resolve(__dirname, '../../..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8')
const load = createRequire(resolve(root, 'research/editor-validation/package-anchor.js'))
const { ringDevicePx } = load('./tolerance.js') as {
  ringDevicePx: (a: { cssWidth: number; reportedDpr: number; nativeDpr: number | null }) => {
    devicePx: number
    scale: number
    basis: 'reported' | 'native'
  }
}

describe('native file pickers hand focus back on cancel (wiring)', () => {
  it('File › Open… reads its origin before the picker and restores after it', () => {
    const runner = read('src/renderer/src/editor/commandRunner.ts')
    const open = runner.slice(
      runner.indexOf("case 'file.open'"),
      runner.indexOf("case 'file.importDslr'")
    )
    expect(open).toContain('commandOrigin(document.activeElement)')
    expect(open).toMatch(/afterNativePicker\(origin, outcome\)/)
  })
  it('File › Import dslrBooth template… restores on cancel and lets the import dialog return to the same place', () => {
    const imp = read('src/renderer/src/editor/dslrImportActions.ts')
    expect(imp).toContain('commandOrigin(document.activeElement)')
    expect(imp).toContain("afterNativePicker(origin, 'cancelled')")
    expect(imp).toContain('noteMenuOpener(origin)')
  })
  it('no timer: restoration waits for the window focus event and one frame, not a delay', () => {
    const rf = read('src/renderer/src/ui/restoreFocus.ts')
    const fn = rf.slice(rf.indexOf('export async function afterNativePicker'))
    expect(fn).toContain("addEventListener('focus'")
    expect(fn).not.toMatch(/setTimeout/)
  })
})

describe('High Contrast: text inside a Highlight state is HighlightText (a11y.css)', () => {
  const css = read('src/renderer/src/styles/a11y.css')
  const block = (re: RegExp): string[] =>
    (css.match(re)?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  const states = block(
    /\/\* Selected \/ on \/ open[^\n]*\n([\s\S]*?)\{\s*forced-color-adjust: none;/
  )
  const texts = block(
    /Every descendant takes HighlightText instead\.\s*\*\/\s*([\s\S]*?)\{\s*color: HighlightText;/
  )
  it('every Highlight state has a matching descendant rule (forced-color-adjust is inherited)', () => {
    expect(states.length).toBeGreaterThanOrEqual(20)
    expect(texts).toEqual(states.map((s) => `${s} *`))
    expect(states).toContain('.view-pill.on')
  })
  it('system colours only, and only inside forced-colors (normal Light/Dark untouched)', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i)
    const body = css.replace(/\/\*[\s\S]*?\*\//g, '').trim()
    expect(body.startsWith('@media (forced-colors: active) {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.match(/@media/g)).toHaveLength(1)
  })
})

describe('physical focus-ring width (validation harness, tolerance.js)', () => {
  it('Windows 125 %, real path: 1.6 CSS px at DPR 1.25 is 2 device px', () => {
    expect(ringDevicePx({ cssWidth: 1.6, reportedDpr: 1.25, nativeDpr: 1.25 })).toMatchObject({
      devicePx: 2,
      basis: 'reported'
    })
  })
  it('Windows 125 % with 100 % emulated (DPR ~1.0000000149): the ring was snapped to the real 1.25 → 2 device px', () => {
    expect(
      ringDevicePx({ cssWidth: 1.6, reportedDpr: 1.0000000149, nativeDpr: 1.25 })
    ).toMatchObject({ devicePx: 2, basis: 'native' })
  })
  it('macOS (native 2, emulated 1 and 1.25): uses the reported scale', () => {
    expect(ringDevicePx({ cssWidth: 2, reportedDpr: 1, nativeDpr: 2 })).toMatchObject({
      devicePx: 2,
      basis: 'reported'
    })
    expect(ringDevicePx({ cssWidth: 2.4, reportedDpr: 1.25, nativeDpr: 2 })).toMatchObject({
      devicePx: 3
    })
  })
  it('an actually insufficient ring still fails under either scale', () => {
    // 1 device px at 125 % (0.8 CSS px), 1 px at 100 %, and a 1.6 px ring on a real 1× display (not snapped).
    expect(ringDevicePx({ cssWidth: 0.8, reportedDpr: 1, nativeDpr: 1.25 }).devicePx).toBeLessThan(
      1.99
    )
    expect(ringDevicePx({ cssWidth: 1, reportedDpr: 1, nativeDpr: 1 }).devicePx).toBeLessThan(1.99)
    expect(ringDevicePx({ cssWidth: 1.6, reportedDpr: 1, nativeDpr: 1 }).devicePx).toBeLessThan(
      1.99
    )
  })
  it('never rounds up: with no whole-pixel match the reported scale is kept', () => {
    expect(ringDevicePx({ cssWidth: 1.3, reportedDpr: 1, nativeDpr: 1.25 })).toMatchObject({
      devicePx: 1.3,
      basis: 'reported'
    })
  })
})
