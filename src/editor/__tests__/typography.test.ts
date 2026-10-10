import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type Layer, type TemplateProject, type TextLayer } from '@domain'
import {
  COMMON_FAMILIES,
  cssFontFamily,
  collectProjectFonts,
  fontInventory,
  fontOptions,
  fontStatus,
  isGenericFamily,
  primaryFamily,
  renderFontFamily,
  searchFonts,
  type FontEnvironment
} from '../fonts'
import { fitTextHeight, replaceFontFamily } from '../typographyMutations'
import { TEXT_PRESETS, presetPatch } from '../textPresets'
import { typographyPreflight } from '../preflight'
import { createEditorStore } from '../store'
import { specFor, textLayout, type RenderEnv } from '@canvas/rendering/nodeSpec'
import { fakePorts, makeProject, shape, text } from './helpers'

const ready = (...families: string[]): FontEnvironment => ({
  catalog: { status: 'ready', families }
})
const noCatalog: FontEnvironment = { catalog: { status: 'unavailable', families: [] } }
let nextZ = 0
const t = (id: string, family: string, over: Partial<TextLayer> = {}): Layer =>
  text(id, ++nextZ, { fontFamily: family, ...over } as Partial<Layer>)

describe('requested family → render stack (never stored)', () => {
  it('appends the fallback stack and keeps the requested name first', () => {
    expect(renderFontFamily('Bickham Script Pro')).toBe(
      'Bickham Script Pro, Helvetica, Arial, sans-serif'
    )
    expect(renderFontFamily('Georgia, serif')).toBe('Georgia, serif, Helvetica, Arial, sans-serif')
    expect(renderFontFamily('')).toBe('Helvetica, Arial, sans-serif')
  })
  it('CSS form quotes names with spaces for the HTML editor', () => {
    expect(cssFontFamily('Bickham Script Pro')).toBe(
      '"Bickham Script Pro", Helvetica, Arial, sans-serif'
    )
    expect(cssFontFamily('Georgia')).toBe('Georgia, Helvetica, Arial, sans-serif')
  })
  it('the canvas layout uses the same stack, and the layer itself is untouched', () => {
    const layer = t('a', 'Bickham Script Pro') as TextLayer
    expect(textLayout(layer).fontFamily).toBe('Bickham Script Pro, Helvetica, Arial, sans-serif')
    expect(layer.fontFamily).toBe('Bickham Script Pro')
    const env: RenderEnv = {
      palette: { colors: [] },
      images: () => undefined,
      photoMode: 'placeholder',
      interactive: false,
      photoLabels: false,
      allLayers: [layer]
    }
    expect(specFor(layer, env)?.config.fontFamily).toBe(textLayout(layer).fontFamily)
  })
  it('generic families and primary-family parsing', () => {
    expect(isGenericFamily('Serif')).toBe(true)
    expect(isGenericFamily('Georgia')).toBe(false)
    expect(primaryFamily('"Cormorant Garamond", serif')).toBe('Cormorant Garamond')
  })
})

describe('font availability', () => {
  it('uses the installed list when it is ready (case-insensitive)', () => {
    const env = ready('Georgia', 'Cormorant Garamond')
    expect(fontStatus('georgia', env)).toEqual({ availability: 'available', basis: 'catalog' })
    expect(fontStatus('Bickham Script Pro', env)).toEqual({
      availability: 'missing',
      basis: 'catalog'
    })
    expect(fontStatus('Georgia, serif', env).availability).toBe('available') // primary family decides
  })
  it('generic families are always available, whatever the catalog', () => {
    expect(fontStatus('serif', noCatalog)).toEqual({ availability: 'available', basis: 'generic' })
    expect(fontStatus('cursive', ready()).availability).toBe('available')
  })
  it('without a catalog it falls back to the probe, and says unknown when it cannot tell', () => {
    expect(fontStatus('Didot', { ...noCatalog, probe: () => true })).toEqual({
      availability: 'available',
      basis: 'probe'
    })
    expect(fontStatus('Didot', { ...noCatalog, probe: () => false }).availability).toBe('missing')
    expect(fontStatus('Didot', noCatalog)).toEqual({ availability: 'unknown', basis: 'none' })
    expect(fontStatus('Didot', { ...noCatalog, probe: () => null }).availability).toBe('unknown')
    expect(fontStatus('Didot', { catalog: { status: 'loading', families: [] } }).availability).toBe(
      'unknown'
    )
  })
  it('a CSS-level fallback never counts as the font existing', () => {
    expect(fontStatus('Totally Fake Font', ready('Georgia')).availability).toBe('missing')
  })
})

describe('project font inventory', () => {
  const project = makeProject([
    t('a', 'Cormorant Garamond'),
    t('b', 'cormorant garamond'),
    t('c', 'Bickham Script Pro'),
    t('d', 'serif'),
    shape('s', 1)
  ])
  it('collects unique requested fonts (case-insensitive) in order of first use, with their layers', () => {
    const fonts = collectProjectFonts(project.layers)
    expect(fonts.map((f) => f.family)).toEqual([
      'Cormorant Garamond',
      'Bickham Script Pro',
      'serif'
    ])
    expect(fonts[0]?.layerIds).toEqual(['a', 'b'])
  })
  it('summarises used / missing / unknown', () => {
    const inv = fontInventory(project, ready('Cormorant Garamond'))
    expect([inv.total, inv.missing, inv.unknown]).toEqual([3, 1, 0])
    expect(inv.entries.map((e) => e.availability)).toEqual(['available', 'missing', 'available'])
    expect(fontInventory(project, noCatalog).unknown).toBe(2)
  })
  it('the preflight foundation lists used, missing and unknown fonts', () => {
    const p = typographyPreflight(project, ready('Cormorant Garamond'))
    expect(p.fontsMissing.map((e) => e.family)).toEqual(['Bickham Script Pro'])
    expect(p.fontsUsed).toHaveLength(3)
  })
})

describe('font picker logic', () => {
  const installed = ['Montserrat', 'EB Garamond', 'Cormorant Garamond', 'Great Vibes', 'Arial']
  it('search is a case-insensitive substring match on the family name', () => {
    expect(searchFonts('garamond', installed)).toEqual(['EB Garamond', 'Cormorant Garamond'])
    expect(searchFonts('', installed)).toHaveLength(5)
    expect(searchFonts('zzz', installed)).toEqual([])
  })
  it('options are sorted, include generics, and keep an uninstalled CURRENT font visible', () => {
    const opts = fontOptions({
      query: '',
      installed,
      current: 'Bickham Script Pro',
      catalogReady: true
    })
    expect(opts[0]).toEqual({ family: 'Bickham Script Pro', kind: 'current-missing' })
    expect(opts.filter((o) => o.kind === 'installed').map((o) => o.family)).toEqual([
      'Arial',
      'Cormorant Garamond',
      'EB Garamond',
      'Great Vibes',
      'Montserrat'
    ])
    expect(opts.some((o) => o.kind === 'generic' && o.family === 'serif')).toBe(true)
  })
  it('an installed current font is not flagged; browsing a query filters without touching it', () => {
    const opts = fontOptions({
      query: 'garamond',
      installed,
      current: 'Montserrat',
      catalogReady: true
    })
    expect(opts.map((o) => o.family)).toEqual(['Cormorant Garamond', 'EB Garamond', 'garamond'])
    expect(opts.find((o) => o.family === 'Montserrat')).toBeUndefined()
  })
  it('typing a name that is not installed offers it as a manual entry (so any family can be requested)', () => {
    const opts = fontOptions({
      query: 'My Wedding Script',
      installed,
      current: 'Arial',
      catalogReady: true
    })
    expect(opts).toEqual([{ family: 'My Wedding Script', kind: 'manual' }])
  })
  it('without a catalog the current font is not called missing (it is simply unknown)', () => {
    const opts = fontOptions({
      query: '',
      installed: [],
      current: 'Bickham Script Pro',
      catalogReady: false
    })
    expect(opts.some((o) => o.kind === 'current-missing')).toBe(false)
    expect(COMMON_FAMILIES.length).toBeGreaterThan(5)
  })
})

describe('font replacement', () => {
  const project = (): TemplateProject =>
    makeProject([
      t('a', 'Didot', { fontSize: 100, fontWeight: 700 }),
      t('b', 'didot'),
      t('c', 'Georgia'),
      t('d', 'Didot, serif'),
      shape('s', 5)
    ])
  it('replace-all swaps only matching families (case-insensitive, primary family), keeps every other property', () => {
    const r = replaceFontFamily(project(), 'Didot', 'Cormorant Garamond')
    expect(r.replaced).toBe(3)
    const fams = r.project.layers
      .filter((l) => l.type === 'text')
      .map((l) => (l as TextLayer).fontFamily)
    expect(fams).toEqual([
      'Cormorant Garamond',
      'Cormorant Garamond',
      'Georgia',
      'Cormorant Garamond'
    ])
    const a = r.project.layers.find((l) => l.id === 'a') as TextLayer
    expect([a.fontSize, a.fontWeight]).toEqual([100, 700])
    expect(r.project.layers.find((l) => l.id === 's')).toEqual(
      project().layers.find((l) => l.id === 's')
    )
    expect(checkProjectIntegrity(r.project)).toEqual([])
  })
  it('does nothing when nothing matches and refuses an empty target', () => {
    const p = project()
    expect(replaceFontFamily(p, 'Nope', 'Arial').project).toBe(p)
    expect(() => replaceFontFamily(p, 'Didot', '  ')).toThrow()
  })
  it('through the store: one undo step; unrelated fonts untouched; redo reapplies', async () => {
    const store = createEditorStore({ ports: fakePorts(project()) })
    await store.getState().openFromDialog()
    expect(store.getState().replaceFont('Didot', 'Arial')).toBe(3)
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().project).not.toBe(store.getState().savedProject)
    store.getState().undo()
    expect(
      (store.getState().project!.layers.find((l) => l.id === 'a') as TextLayer).fontFamily
    ).toBe('Didot')
    store.getState().redo()
    expect(
      (store.getState().project!.layers.find((l) => l.id === 'c') as TextLayer).fontFamily
    ).toBe('Georgia')
  })
})

describe('portability: a font missing on this machine is never rewritten', () => {
  it('requested family survives opening, a save-like round trip and unrelated edits; replacement is explicit', async () => {
    const project = makeProject([t('a', 'Font B Pro'), t('b', 'Font A')])
    const machineB = ready('Font A')
    expect(fontInventory(project, machineB).entries.map((e) => [e.family, e.availability])).toEqual(
      [
        ['Font B Pro', 'missing'],
        ['Font A', 'available']
      ]
    )
    const store = createEditorStore({ ports: fakePorts(project) })
    await store.getState().openFromDialog()
    store.getState().commitText('a', 'Edited text')
    store.getState().editLayers(['a'], { fontSize: 80 })
    expect(
      (store.getState().project!.layers.find((l) => l.id === 'a') as TextLayer).fontFamily
    ).toBe('Font B Pro')
    await store.getState().save()
    expect(
      (store.getState().project!.layers.find((l) => l.id === 'a') as TextLayer).fontFamily
    ).toBe('Font B Pro')
    store.getState().replaceFont('Font B Pro', 'Font A')
    expect(
      (store.getState().project!.layers.find((l) => l.id === 'a') as TextLayer).fontFamily
    ).toBe('Font A')
  })
})

describe('Fit height to content', () => {
  // A fake canvas measurer with Konva's formula: lines × fontSize × lineHeight; lines come from a simple wrap.
  const measure = (l: TextLayer): number => {
    const charsPerLine = Math.max(1, Math.floor(l.width / (l.fontSize * 0.5 + l.letterSpacing)))
    const lines = l.content
      .split('\n')
      .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
    return lines * l.fontSize * l.lineHeight
  }
  const base = (over: Partial<TextLayer>): TemplateProject =>
    makeProject([
      t('a', 'Georgia', {
        x: 100,
        y: 200,
        width: 1000,
        height: 999,
        fontSize: 100,
        lineHeight: 1.2,
        content: 'Hello',
        ...over
      })
    ])
  const open = async (p: TemplateProject) => {
    const store = createEditorStore({ ports: fakePorts(p), measureTextHeight: measure })
    await store.getState().openFromDialog()
    return store
  }
  const heightOf = (s: Awaited<ReturnType<typeof open>>): number =>
    (s.getState().project!.layers[0] as TextLayer).height

  it('mutation sets only the height (rounded), keeping width, position and font size', () => {
    const p = fitTextHeight(base({}), 'a', 120.456)
    const l = p.layers[0] as TextLayer
    expect([l.height, l.width, l.x, l.y, l.fontSize]).toEqual([120.46, 1000, 100, 200, 100])
    expect(() => fitTextHeight(base({}), 'a', 0)).toThrow()
    expect(() => fitTextHeight(makeProject([shape('s', 0)]), 's', 10)).toThrow()
  })
  it('single line, multiline, narrower width, bigger size and different line height all fit', async () => {
    const one = await open(base({}))
    expect(one.getState().fitTextHeight('a')).toBe(true)
    expect(heightOf(one)).toBe(120)
    const multi = await open(base({ content: 'a\nb\nc' }))
    multi.getState().fitTextHeight('a')
    expect(heightOf(multi)).toBe(360)
    const narrow = await open(base({ content: 'x'.repeat(40), width: 400 }))
    narrow.getState().fitTextHeight('a')
    expect(heightOf(narrow)).toBe(Math.ceil(40 / 8) * 120)
    const big = await open(base({ fontSize: 200 }))
    big.getState().fitTextHeight('a')
    expect(heightOf(big)).toBe(240)
    const tall = await open(base({ lineHeight: 2 }))
    tall.getState().fitTextHeight('a')
    expect(heightOf(tall)).toBe(200)
  })
  it('is one history entry, marks the project Modified, and undo/redo restore the box', async () => {
    const s = await open(base({}))
    s.getState().fitTextHeight('a')
    expect(s.getState().history.past).toHaveLength(1)
    expect(s.getState().project).not.toBe(s.getState().savedProject)
    s.getState().undo()
    expect(heightOf(s)).toBe(999)
    s.getState().redo()
    expect(heightOf(s)).toBe(120)
  })
  it('does nothing for a locked layer, a non-text layer, or without a measurer', async () => {
    const locked = await open(base({ locked: true }))
    expect(locked.getState().fitTextHeight('a')).toBe(false)
    const none = createEditorStore({ ports: fakePorts(base({})) })
    await none.getState().openFromDialog()
    expect(none.getState().fitTextHeight('a')).toBe(false)
    expect(none.getState().lastMessage).toMatch(/canvas/)
  })
})

describe('text presets', () => {
  const ctx = (installed: string[]) => ({
    designHeight: 3600,
    isAvailable: (f: string) =>
      installed.includes(f) || ['serif', 'cursive', 'sans-serif'].includes(f),
    palette: { colors: [] }
  })
  it('pick the first installed preferred family, ending in a generic when nothing is installed', () => {
    const title = TEXT_PRESETS.find((p) => p.id === 'title')!
    expect((presetPatch(title, ctx(['Georgia'])) as { fontFamily: string }).fontFamily).toBe(
      'Georgia'
    )
    expect((presetPatch(title, ctx([])) as { fontFamily: string }).fontFamily).toBe('serif')
    expect(
      (
        presetPatch(
          TEXT_PRESETS.find((p) => p.id === 'names')!,
          ctx([])
        ) as { fontFamily: string }
      ).fontFamily
    ).toBe('cursive')
  })
  it('size scales with the design height; colour links only to a role the palette has', () => {
    const date = TEXT_PRESETS.find((p) => p.id === 'date')!
    expect((presetPatch(date, ctx([])) as { fontSize: number }).fontSize).toBe(94)
    expect(presetPatch(date, ctx([]))).not.toHaveProperty('fill')
    const withText = presetPatch(date, {
      ...ctx([]),
      palette: { colors: [{ id: 'p1', role: 'text', name: 'Text', value: '#222222' }] }
    })
    expect((withText as { fill: unknown }).fill).toEqual({ kind: 'palette', paletteColorId: 'p1' })
  })
  it('applying a preset is one undo step and marks Modified', async () => {
    const store = createEditorStore({ ports: fakePorts(makeProject([t('a', 'Georgia')])) })
    await store.getState().openFromDialog()
    expect(store.getState().applyTextPreset('a', 'title', () => true)).toBe(true)
    expect(store.getState().history.past).toHaveLength(1)
    expect((store.getState().project!.layers[0] as TextLayer).align).toBe('center')
    expect(store.getState().applyTextPreset('a', 'nope', () => true)).toBe(false)
  })
})
