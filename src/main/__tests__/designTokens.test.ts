import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_THEME } from '../../renderer/src/editor/canvasTheme'

/**
 * Design tokens (Phase 7B B2, ADR-055): one token set with a Light (default) and a Dark theme, two densities, theme-
 * independent canvas overlays and a bundled UI font. Every contrast rule from the single-theme era now holds in BOTH
 * themes.
 */
const styles = (name: string): string =>
  readFileSync(resolve(__dirname, '../../renderer/src/styles', name), 'utf8')
const TOKENS = styles('tokens.css')

/** The declarations inside the n-th block (0-based) whose selector list matches exactly. */
function block(selector: string, nth = 0): Map<string, string> {
  const re = new RegExp(`(^|\\n)${selector.replace(/[[\]()'.*]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  let m: RegExpExecArray | null = null
  for (let i = 0; i <= nth; i++) m = re.exec(TOKENS)
  if (!m) throw new Error(`no block ${selector}`)
  const out = new Map<string, string>()
  for (const d of m[2]!.replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = d.indexOf(':')
    if (i < 0) continue
    const name = d.slice(0, i).trim()
    if (name.startsWith('--')) out.set(name, d.slice(i + 1).trim())
  }
  return out
}

const PRIMITIVES = block(':root')
const LIGHT = block(":root,\n:root[data-theme='light']")
const DARK = block(":root[data-theme='dark']")

/** Resolves var() chains for one theme down to a literal colour. */
function resolveVar(theme: Map<string, string>, name: string, depth = 0): string {
  const raw = theme.get(name) ?? PRIMITIVES.get(name)
  if (raw === undefined) throw new Error(`undefined token ${name}`)
  const m = /^var\((--[\w-]+)\)$/.exec(raw)
  if (m && depth < 10) return resolveVar(theme, m[1]!, depth + 1)
  return raw
}

function rgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const n = parseInt(hex[1]!, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  throw new Error(`not an opaque hex colour: ${color}`)
}
function luminance(c: string): number {
  const ch = rgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

describe('semantic tokens: Light (default) and Dark from one token set', () => {
  const SEMANTIC = [
    '--c-surface-app',
    '--c-surface-panel',
    '--c-surface-raised',
    '--c-surface-overlay',
    '--c-surface-input',
    '--c-surface-canvas',
    '--c-text-primary',
    '--c-text-secondary',
    '--c-text-label',
    '--c-text-muted',
    '--c-text-disabled',
    '--c-border-subtle',
    '--c-border-normal',
    '--c-border-strong',
    '--c-hover',
    '--c-pressed',
    '--c-focus',
    '--c-selection',
    '--c-accent',
    '--c-accent-hover',
    '--c-accent-pressed',
    '--c-accent-subtle',
    '--c-accent-border',
    '--c-on-accent',
    '--c-status-error-fg',
    '--c-status-error-bg',
    '--c-status-error-border',
    '--c-status-attention-fg',
    '--c-status-attention-bg',
    '--c-status-attention-border',
    '--c-status-info-fg',
    '--c-status-info-bg',
    '--c-status-info-border',
    '--c-status-ready-fg',
    '--c-status-ready-bg',
    '--c-status-ready-border',
    '--c-kind-photo',
    '--c-kind-text',
    '--c-kind-image',
    '--c-kind-shape',
    '--c-kind-group',
    '--shadow-1',
    '--shadow-2',
    '--shadow-3',
    '--shadow-artboard',
    '--c-scrim'
  ]

  it('Light is the default (the bare :root block) and both themes define every semantic token', () => {
    expect(TOKENS).toMatch(/:root,\n:root\[data-theme='light'\] \{\n {2}color-scheme: light;/)
    for (const t of SEMANTIC) {
      expect(LIGHT.has(t), `light ${t}`).toBe(true)
      expect(DARK.has(t), `dark ${t}`).toBe(true)
    }
    expect([...LIGHT.keys()].sort()).toEqual([...DARK.keys()].sort())
  })

  it.each([
    ['light', LIGHT],
    ['dark', DARK]
  ] as const)('%s: text and accents meet WCAG AA contrast on their surfaces', (_n, theme) => {
    const c = (name: string): string => resolveVar(theme, name)
    for (const surface of ['--c-surface-app', '--c-surface-panel', '--c-surface-raised']) {
      for (const fg of [
        '--c-text-primary',
        '--c-text-secondary',
        '--c-text-label',
        '--c-text-muted'
      ])
        expect(contrast(c(fg), c(surface)), `${fg} on ${surface}`).toBeGreaterThanOrEqual(4.5)
      // Focus ring and accent are non-text UI indicators: 3:1.
      expect(contrast(c('--c-focus'), c(surface))).toBeGreaterThanOrEqual(3)
      expect(contrast(c('--c-accent'), c(surface))).toBeGreaterThanOrEqual(3)
    }
    expect(contrast(c('--c-on-accent'), c('--c-accent'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c('--c-on-tooltip'), c('--c-surface-tooltip'))).toBeGreaterThanOrEqual(4.5)
    for (const s of ['error', 'attention', 'info', 'ready'])
      expect(contrast(c(`--c-status-${s}-fg`), c('--c-surface-panel'))).toBeGreaterThanOrEqual(4.5)
  })

  it('selection and focus are indigo, never an element-kind hue', () => {
    for (const theme of [LIGHT, DARK]) {
      const kinds = ['photo', 'text', 'image', 'shape', 'group'].map((k) =>
        resolveVar(theme, `--c-kind-${k}`)
      )
      expect(kinds).not.toContain(resolveVar(theme, '--c-selection'))
      expect(kinds).not.toContain(resolveVar(theme, '--c-focus'))
      expect(kinds).not.toContain(resolveVar(theme, '--c-accent'))
      expect(theme.get('--c-selection')).toMatch(/indigo/)
    }
  })

  it('components never use primitives or hard-coded theme colours directly', () => {
    for (const f of ['ui.css', 'shell.css', 'panels.css', 'base.css']) {
      const css = styles(f)
      expect(css, f).not.toMatch(/var\(--p-(?!n-0\))/) // only pure white for the switch thumb
      expect(css, f).not.toMatch(/#33353d|#8e9dff|#0a0b0d|rgb\(6 7 9/)
    }
  })
})

describe('canvas overlays are theme-independent', () => {
  it('overlay tokens are defined once, outside both theme blocks', () => {
    for (const t of ['safe', 'trim', 'flag', 'cut', 'guide', 'selection', 'halo']) {
      expect(LIGHT.has(`--c-overlay-${t}`)).toBe(false)
      expect(DARK.has(`--c-overlay-${t}`)).toBe(false)
      expect(PRIMITIVES.has(`--p-ov-${t}`)).toBe(true)
    }
  })

  it('Konva overlay colours mirror the overlay primitives (trim = muted amber, B1 V6)', () => {
    expect(CANVAS_THEME.safeLine).toBe(PRIMITIVES.get('--p-ov-safe'))
    expect(CANVAS_THEME.guide).toBe(PRIMITIVES.get('--p-ov-guide'))
    expect(CANVAS_THEME.flagged).toBe(PRIMITIVES.get('--p-ov-flag'))
    expect(CANVAS_THEME.accent).toBe(PRIMITIVES.get('--p-ov-selection'))
    const [r, g, b] = rgb(PRIMITIVES.get('--p-ov-trim')!)
    expect(CANVAS_THEME.trimHatch).toBe(`rgba(${r}, ${g}, ${b}, 0.7)`)
    expect(CANVAS_THEME.trimFill).toBe(`rgba(${r}, ${g}, ${b}, 0.16)`)
  })

  it('the safe-area warning has a contrast halo from the overlay halo primitive (B4), same in both themes', () => {
    const halo = PRIMITIVES.get('--p-ov-halo')!
    const m = /rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/.exec(halo)
    expect(m).not.toBeNull()
    expect(CANVAS_THEME.halo).toBe(`rgba(${m![1]}, ${m![2]}, ${m![3]}, ${m![4]})`)
    expect(LIGHT.has('--c-overlay-halo')).toBe(false)
    expect(DARK.has('--c-overlay-halo')).toBe(false)
  })
})

describe('density: one structure, two sizes', () => {
  const COMFY = block(":root,\n:root[data-density='comfortable']")
  const COMPACT = block(":root[data-density='compact']")

  it('Comfortable is the default and matches the approved B1 round 2 values', () => {
    expect(COMFY.get('--d-control')).toBe('34px')
    expect(COMFY.get('--d-control-lg')).toBe('38px')
    expect(COMFY.get('--d-row')).toBe('36px')
    expect(COMFY.get('--d-rail')).toBe('80px')
    expect(COMFY.get('--d-topbar')).toBe('52px')
    expect(COMFY.get('--d-viewbar')).toBe('48px')
    expect(COMFY.get('--d-section')).toBe('40px')
    expect(COMFY.get('--d-statusbar')).toBe('30px')
    expect(COMFY.get('--d-fs-body')).toBe('14px')
  })

  it('Compact defines exactly the same tokens, only smaller', () => {
    expect([...COMPACT.keys()].sort()).toEqual([...COMFY.keys()].sort())
    expect(COMPACT.get('--d-control')).toBe('28px')
    expect(COMPACT.get('--d-fs-body')).toBe('13px')
    for (const [k, v] of COMPACT)
      expect(parseFloat(v), k).toBeLessThanOrEqual(parseFloat(COMFY.get(k)!))
  })

  it('density and UI scale only touch chrome tokens (no canvas or design geometry lives in CSS)', () => {
    expect(TOKENS).not.toMatch(/--(zoom|dpi|design|artboard-(width|height))/)
    expect(TOKENS).toMatch(/--h-control: calc\(var\(--d-control\) \* var\(--ui-scale\)\)/)
  })
})

describe('Inter is bundled locally, with no web font dependency', () => {
  const root = resolve(__dirname, '../../..')
  it('the renderer imports the packaged variable font and the token stack names it first', () => {
    const main = readFileSync(resolve(root, 'src/renderer/src/main.tsx'), 'utf8')
    expect(main).toMatch(/import '@fontsource-variable\/inter\/wght\.css'/)
    expect(TOKENS).toMatch(/--font-ui:\s*'Inter Variable', system-ui/)
    const pkg = resolve(root, 'node_modules/@fontsource-variable/inter')
    expect(existsSync(resolve(pkg, 'wght.css'))).toBe(true)
    expect(
      readdirSync(resolve(pkg, 'files')).some((f) => /latin-wght-normal\.woff2$/.test(f))
    ).toBe(true)
    const css = readFileSync(resolve(pkg, 'wght.css'), 'utf8')
    expect(css).not.toMatch(/https?:\/\//)
    expect(css).toMatch(/url\(\.\/files\//)
  })

  it('no stylesheet or the page loads fonts (or anything) from the network', () => {
    const html = readFileSync(resolve(root, 'src/renderer/index.html'), 'utf8')
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic|<link[^>]+https?:/)
    for (const f of ['tokens.css', 'base.css', 'ui.css', 'shell.css', 'panels.css'])
      expect(styles(f)).not.toMatch(/@import|url\(\s*['"]?https?:/)
  })

  it('the UI font family is not a name a project font could use ("Inter Variable", not "Inter")', () => {
    expect(TOKENS).not.toMatch(/--font-ui:[^;]*'Inter',/)
  })
})

describe('legacy token names keep their meaning in both themes', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK]
  ] as const)('%s: the pre-7B contrast rules still hold', (_n, theme) => {
    const ALIAS: Record<string, string> = {
      'c-app': '--c-surface-app',
      'c-panel': '--c-surface-panel',
      'c-elevated': '--c-surface-raised',
      'c-input': '--c-surface-input',
      'c-canvas-surround': '--c-surface-canvas',
      'c-text': '--c-text-primary',
      'c-text-2': '--c-text-secondary',
      'c-text-3': '--c-text-muted',
      'c-text-label': '--c-text-label',
      'c-text-faint': '--c-text-faint',
      'c-on-accent': '--c-on-accent',
      'c-accent': '--c-accent',
      'c-focus': '--c-focus',
      'c-warning': '--c-status-attention-fg',
      'c-error': '--c-status-error-fg',
      'c-success': '--c-status-ready-fg'
    }
    // The aliases really point at these semantic tokens.
    const aliases = block(':root', 1)
    expect(aliases.get('--c-app')).toBe('var(--c-surface-app)')
    expect(aliases.get('--c-text-2')).toBe('var(--c-text-secondary)')
    expect(aliases.get('--c-warning')).toBe('var(--c-status-attention-fg)')
    const token = (n: string): string => resolveVar(theme, ALIAS[n]!)
    for (const s of ['c-app', 'c-panel', 'c-elevated', 'c-input', 'c-canvas-surround']) {
      expect(contrast(token('c-text'), token(s)), s).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token('c-text-2'), token(s)), s).toBeGreaterThanOrEqual(4.5)
    }
    for (const s of ['c-app', 'c-panel', 'c-elevated']) {
      expect(contrast(token('c-text-3'), token(s))).toBeGreaterThanOrEqual(4.5)
      expect(contrast(token('c-text-label'), token(s))).toBeGreaterThanOrEqual(4.5)
    }
    // Labels sit between secondary and muted text.
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
    expect(contrast(token('c-on-accent'), token('c-accent'))).toBeGreaterThanOrEqual(4.5)
    for (const c of ['c-warning', 'c-error', 'c-success'])
      expect(contrast(token(c), token('c-panel'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('c-focus'), token('c-panel'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('c-focus'), token('c-canvas-surround'))).toBeGreaterThanOrEqual(3)
    expect(contrast(token('c-accent'), token('c-panel'))).toBeGreaterThanOrEqual(3)
  })

  it('spacing, radius and type tokens are the documented scale (× the interface scale)', () => {
    const base = (name: string): number =>
      Number(
        new RegExp(`--${name}:\\s*calc\\((\\d+)px \\* var\\(--ui-scale\\)\\)`).exec(TOKENS)?.[1]
      )
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => base(`sp-${n}`))).toEqual([4, 6, 8, 12, 16, 20, 24])
    const px = (name: string): number =>
      Number(new RegExp(`--${name}:\\s*(\\d+)px`).exec(TOKENS)?.[1])
    expect([px('r-sm'), px('r-md'), px('r-lg')]).toEqual([4, 6, 10])
    // No tiny text at either density (100 % scale; 90 % is an explicit user choice).
    for (const d of [
      block(":root,\n:root[data-density='comfortable']"),
      block(":root[data-density='compact']")
    ])
      for (const t of ['--d-fs-body', '--d-fs-label', '--d-fs-input', '--d-fs-meta'])
        expect(parseFloat(d.get(t)!)).toBeGreaterThanOrEqual(12)
  })
})
