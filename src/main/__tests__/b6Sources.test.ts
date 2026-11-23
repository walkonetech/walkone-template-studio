import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8')

describe('B6 sources', () => {
  it('forced colours: focus, selection and fields have system-colour equivalents', () => {
    const css = read('src/renderer/src/styles/a11y.css')
    expect(css).toMatch(/@media \(forced-colors: active\)/)
    for (const sel of [
      ':focus-visible',
      '.ui-input:focus',
      '.ui-menuitem:focus-visible',
      '.layer-row.selected',
      '.toolrail-btn.active',
      ".ui-tab[aria-selected='true']",
      ".ui-switch[aria-checked='true'] .track",
      "[aria-invalid='true']"
    ])
      expect(css, sel).toContain(sel)
    expect(css).toMatch(/Highlight/)
    expect(read('src/renderer/src/main.tsx')).toMatch(/styles\/a11y\.css/)
  })
  it('reduced motion turns off CSS motion and smooth scrolling', () => {
    expect(read('src/renderer/src/styles/base.css')).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*transition: none !important[\s\S]*animation: none !important/
    )
    expect(read('src/renderer/src/editor/ExportDialog.tsx')).toMatch(
      /prefers-reduced-motion: reduce\)'\)\.matches\s*\?\s*'auto'\s*:\s*'smooth'/
    )
  })
  it('the rail discloses its drawer (aria-expanded), not a pressed toggle', () => {
    const rail = read('src/renderer/src/editor/ToolRail.tsx')
    expect(rail).toMatch(/aria-expanded=\{active\}/)
    expect(rail).not.toMatch(/aria-pressed=\{active\}/)
  })
  it('menus use the shared access-key rules', () => {
    const menu = read('src/renderer/src/ui/Menu.tsx')
    expect(menu).toMatch(/assignMnemonics/)
    expect(menu).toMatch(/createAltTap/)
  })
})
