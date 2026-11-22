import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import * as prettier from 'prettier'
import { describe, expect, it } from 'vitest'

/** Phase 7B B5.1: Windows follow-ups (dialog focus from a menu, DPR tolerance, committed results formatting). */

const root = resolve(__dirname, '../../..')
const load = createRequire(resolve(root, 'research/editor-validation/package-anchor.js'))
const tolerance = load('./tolerance.js') as {
  DPR_EPSILON: number
  nearlyEqual: (a: unknown, e: number, eps: number) => boolean
  dprIs: (a: unknown, e?: number) => boolean
}
const writer = load('./results-writer.js') as {
  formatResultsJson: (text: string, file: string) => string
}

describe('dialog focus return wiring (File › Settings…)', () => {
  it('the menu notes its trigger before running an item and the Dialog uses it as its opener', () => {
    const menu = readFileSync(resolve(root, 'src/renderer/src/ui/Menu.tsx'), 'utf8')
    expect(menu).toMatch(/noteMenuOpener\(anchor\)\s*\n\s*onClose\(\)\s*\n\s*e\.onSelect\(\)/)
    const dialog = readFileSync(resolve(root, 'src/renderer/src/ui/Dialog.tsx'), 'utf8')
    expect(dialog).toContain('const previous = dialogOpener(document.activeElement)')
    // Focus goes back through restoreFocus (no tooltip pops on a restored focus) and never reopens the menu.
    expect(dialog).toContain('restoreFocus(previous)')
  })
})

describe('DPR tolerance (validation harness)', () => {
  it('accepts exactly 1 and the float32 noise seen on Windows', () => {
    expect(tolerance.dprIs(1)).toBe(true)
    expect(tolerance.dprIs(1.0000000149)).toBe(true)
    expect(tolerance.dprIs(1 + 2 ** -26)).toBe(true)
  })
  it('still fails any real page-zoom or device-scale change', () => {
    for (const bad of [0.9, 0.99, 1.01, 1.1, 1.25, 1.5, 2, 1.00001, NaN, Infinity])
      expect(tolerance.dprIs(bad), String(bad)).toBe(false)
    expect(tolerance.dprIs('1')).toBe(false)
    expect(tolerance.dprIs(undefined)).toBe(false)
  })
  it('the epsilon is explicit, far above float noise and far below any zoom step', () => {
    expect(tolerance.DPR_EPSILON).toBe(1e-6)
    expect(tolerance.DPR_EPSILON).toBeGreaterThan(2 ** -26 * 10)
    expect(tolerance.DPR_EPSILON).toBeLessThan(0.01 / 1000)
  })
  it('the B5 suite uses the tolerance, not exact equality', () => {
    const suite = readFileSync(
      resolve(root, 'research/editor-validation/validate-7b-b5.js'),
      'utf8'
    )
    expect(suite).toContain('dprIs(scaled.dpr, 1)')
    expect(suite).not.toMatch(/dpr\s*===\s*1/)
  })
})

describe('committed validation results stay Prettier-clean', () => {
  const file = resolve(root, 'research/editor-validation/results-example.json')
  const sample = [
    { name: 'a check', ok: true, detail: { steps: ['photo', 'text', 'colors'], n: 3 } },
    { name: 'another', ok: false, detail: null }
  ]
  it('formats suite output deterministically and in the repository style', async () => {
    const raw = JSON.stringify(sample, null, 2) + '\n'
    const options = { ...(await prettier.resolveConfig(file)), filepath: file }
    expect(await prettier.check(raw, options)).toBe(false)
    const once = writer.formatResultsJson(raw, file)
    expect(await prettier.check(once, options)).toBe(true)
    expect(writer.formatResultsJson(once, file)).toBe(once)
    expect(JSON.parse(once)).toEqual(sample)
  })
  it('every suite writes its results through the formatter', () => {
    const dir = resolve(root, 'research/editor-validation')
    for (const f of readdirSync(dir).filter((x) => /^validate.*\.js$/.test(x))) {
      const s = readFileSync(resolve(dir, f), 'utf8')
      expect(s, f).not.toMatch(/writeFileSync\([^)]*results-[\w-]+\.json/)
      if (s.includes('results-')) expect(s, f).toMatch(/writeResults\(\s*'results-/)
    }
  })
})
