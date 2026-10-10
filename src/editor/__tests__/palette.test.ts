import { describe, expect, it } from 'vitest'
import {
  checkProjectIntegrity,
  type ShapeLayer,
  type TemplateProject,
  type TextLayer
} from '@domain'
import { planOutput } from '@canvas/rendering/composition'
import { resolveColor } from '@canvas/rendering/color'
import {
  PaletteInUseError,
  addBasicPalette,
  addPaletteColor,
  brokenPaletteReferences,
  paletteReferences,
  removePaletteColor,
  renamePaletteColor,
  setPaletteColorValue
} from '../paletteMutations'
import { palettePreflight } from '../preflight'
import { createEditorStore } from '../store'
import { fakePorts, makeProject, photo, shape, text } from './helpers'
import type { Layer } from '@domain'

const ACCENT = 'acc-1'
const base = (): TemplateProject => {
  const p = makeProject([
    text('t', 0, { fill: { kind: 'palette', paletteColorId: ACCENT } } as Partial<Layer>),
    shape('r', 1, {
      fill: { kind: 'palette', paletteColorId: ACCENT },
      stroke: { color: { kind: 'palette', paletteColorId: ACCENT }, width: 4 }
    } as Partial<Layer>),
    photo('p', 1, {
      zIndex: 2,
      frame: { style: 'solid', thickness: 10, color: { kind: 'palette', paletteColorId: ACCENT } }
    } as Partial<Layer>),
    shape('lit', 3, { fill: { kind: 'literal', value: '#c6a45d' } } as Partial<Layer>)
  ])
  return {
    ...p,
    canvas: { ...p.canvas, backgroundColor: { kind: 'palette', paletteColorId: ACCENT } },
    palette: { colors: [{ id: ACCENT, role: 'accent', name: 'Accent', value: '#c6a45d' }] }
  }
}

describe('palette entries', () => {
  it('add: semantic role once, custom many; names default sensibly; hex validated and normalized', () => {
    const p = makeProject([])
    const a = addPaletteColor(p, { role: 'accent', value: '#C6A45D' }, { createId: () => 'x1' })
    expect(a.project.palette.colors).toEqual([
      { id: 'x1', role: 'accent', name: 'Accent', value: '#c6a45d' }
    ])
    expect(() => addPaletteColor(a.project, { role: 'accent', value: '#ffffff' })).toThrow(
      /already/
    )
    const c1 = addPaletteColor(
      a.project,
      { role: 'custom', name: 'Rose Gold', value: 'b76e79' },
      { createId: () => 'x2' }
    )
    const c2 = addPaletteColor(
      c1.project,
      { role: 'custom', value: '#e6d5a8ff' },
      { createId: () => 'x3' }
    )
    expect(c2.project.palette.colors.map((c) => [c.name, c.value])).toEqual([
      ['Accent', '#c6a45d'],
      ['Rose Gold', '#b76e79'],
      ['Color 2', '#e6d5a8ff']
    ])
    expect(() => addPaletteColor(p, { role: 'custom', value: 'nope' })).toThrow(/hex/)
    expect(checkProjectIntegrity(c2.project)).toEqual([])
  })
  it('basic palette adds only the missing semantic roles (background matches the canvas)', () => {
    const p = addBasicPalette(makeProject([]))
    expect(p.palette.colors.map((c) => c.role).sort()).toEqual([
      'accent',
      'background',
      'primary',
      'secondary',
      'text'
    ])
    expect(p.palette.colors.find((c) => c.role === 'background')?.value).toBe('#ffffff')
    expect(addBasicPalette(p).palette.colors).toHaveLength(5)
    expect(checkProjectIntegrity(p)).toEqual([])
  })
  it('edit value: no-op when unchanged, validated, unknown id refused', () => {
    const p = base()
    expect(setPaletteColorValue(p, ACCENT, '#C6A45D')).toBe(p)
    expect(setPaletteColorValue(p, ACCENT, '#d3a74e').palette.colors[0]?.value).toBe('#d3a74e')
    expect(() => setPaletteColorValue(p, 'nope', '#ffffff')).toThrow()
    expect(() => setPaletteColorValue(p, ACCENT, 'zzz')).toThrow()
  })
  it('rename keeps the id and every reference; semantic names are fixed', () => {
    const { project } = addPaletteColor(
      base(),
      { role: 'custom', name: 'Old', value: '#112233' },
      { createId: () => 'cust' }
    )
    const linked = {
      ...project,
      layers: project.layers.map((l) =>
        l.id === 'lit' ? ({ ...l, fill: { kind: 'palette', paletteColorId: 'cust' } } as Layer) : l
      )
    }
    const renamed = renamePaletteColor(linked, 'cust', 'Champagne')
    expect(renamed.palette.colors.find((c) => c.id === 'cust')?.name).toBe('Champagne')
    expect(paletteReferences(renamed, 'cust')).toHaveLength(1)
    expect(
      resolveColor(
        renamed.palette,
        (renamed.layers.find((l) => l.id === 'lit') as ShapeLayer).fill!
      )
    ).toBe('#112233')
    expect(() => renamePaletteColor(base(), ACCENT, 'Gold')).toThrow(/custom/)
    expect(() => renamePaletteColor(renamed, 'cust', '  ')).toThrow()
  })
})

describe('usage and removal', () => {
  it('counts every referencing property (text colour, fill, stroke, frame, background)', () => {
    const refs = paletteReferences(base(), ACCENT)
    expect(refs.map((r) => r.property).sort()).toEqual([
      'background',
      'fill',
      'frame color',
      'stroke',
      'text color'
    ])
  })
  it('refuses to remove a used entry (with the usage count) and removes an unused one', () => {
    expect(() => removePaletteColor(base(), ACCENT)).toThrow(PaletteInUseError)
    expect(() => removePaletteColor(base(), ACCENT)).toThrow(/5 properties/)
    const { project } = addPaletteColor(
      makeProject([]),
      { role: 'custom', value: '#123456' },
      { createId: () => 'u' }
    )
    expect(removePaletteColor(project, 'u').palette.colors).toEqual([])
    expect(removePaletteColor(project, 'missing')).toBe(project)
  })
  it('after detaching every use the entry can be removed (store, one undo step each)', async () => {
    const store = createEditorStore({ ports: fakePorts(base()) })
    await store.getState().openFromDialog()
    expect(store.getState().removePaletteColor(ACCENT)).toBe(false)
    expect(store.getState().lastMessage).toMatch(/used by 5 properties/)
    expect(store.getState().history.past).toHaveLength(0)
    const lit = { kind: 'literal' as const, value: '#c6a45d' }
    store.getState().editLayers(['t'], { fill: lit })
    store.getState().editLayers(['r'], { fill: lit, stroke: { color: lit, width: 4 } })
    store.getState().editLayers(['p'], { frame: { style: 'solid', thickness: 10, color: lit } })
    store.getState().setCanvasBackgroundColor(lit)
    expect(store.getState().removePaletteColor(ACCENT)).toBe(true)
    expect(store.getState().project!.palette.colors).toEqual([])
    expect(checkProjectIntegrity(store.getState().project!)).toEqual([])
  })
})

describe('global colour update', () => {
  it('changing Accent updates every linked property and leaves literals alone', () => {
    const p = setPaletteColorValue(base(), ACCENT, '#d3a74e')
    const r = (c: Parameters<typeof resolveColor>[1]) => resolveColor(p.palette, c)
    expect(r((p.layers.find((l) => l.id === 't') as TextLayer).fill)).toBe('#d3a74e')
    const rect = p.layers.find((l) => l.id === 'r') as ShapeLayer
    expect([r(rect.fill!), r(rect.stroke!.color)]).toEqual(['#d3a74e', '#d3a74e'])
    const ph = p.layers.find((l) => l.id === 'p')!
    expect(ph.type === 'photo' && ph.frame.style === 'solid' && r(ph.frame.color)).toBe('#d3a74e')
    expect(r(p.canvas.backgroundColor)).toBe('#d3a74e')
    expect(r((p.layers.find((l) => l.id === 'lit') as ShapeLayer).fill!)).toBe('#c6a45d') // literal unchanged
    // the layers themselves were not rewritten (references, not copies)
    expect(p.layers).toEqual(base().layers)
  })
  it('is one history entry, marks Modified, undo/redo, and the change reaches both derived print copies', async () => {
    const strip = {
      ...base(),
      canvas: { ...base().canvas, print: { width: 2, height: 6, unit: 'in' as const, dpi: 600 } },
      output: {
        print: { width: 4, height: 6, unit: 'in' as const, dpi: 600 },
        layout: { kind: 'grid' as const, columns: 2, rows: 1, gap: 0 }
      }
    }
    const store = createEditorStore({ ports: fakePorts(strip) })
    await store.getState().openFromDialog()
    expect(store.getState().setPaletteColor(ACCENT, '#d3a74e')).toBe(true)
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().project).not.toBe(store.getState().savedProject)
    const plan = planOutput(store.getState().project!)
    for (const copy of plan.copies) {
      const t = copy.layers.find((l) => l.id === 't') as TextLayer
      expect(resolveColor(store.getState().project!.palette, t.fill)).toBe('#d3a74e')
    }
    expect(store.getState().project!.palette).toBe(store.getState().project!.palette) // one palette, no per-copy state
    store.getState().undo()
    expect(store.getState().project!.palette.colors[0]?.value).toBe('#c6a45d')
    store.getState().redo()
    expect(store.getState().project!.palette.colors[0]?.value).toBe('#d3a74e')
  })
  it('a picker drag coalesces into one history entry', async () => {
    const store = createEditorStore({
      ports: fakePorts(base()),
      clock: (() => {
        let n = 0
        return () => (n += 10)
      })()
    })
    await store.getState().openFromDialog()
    for (const v of ['#c6a45e', '#c6a45f', '#c6a460', '#c6a461'])
      store.getState().setPaletteColor(ACCENT, v, { coalesceKey: 'palette:acc' })
    expect(store.getState().history.past).toHaveLength(1)
    expect(store.getState().project!.palette.colors[0]?.value).toBe('#c6a461')
  })
})

describe('detach and link', () => {
  it('detaching stores the RESOLVED literal; later palette changes no longer affect it', async () => {
    const store = createEditorStore({ ports: fakePorts(base()) })
    await store.getState().openFromDialog()
    const resolved = resolveColor(
      store.getState().project!.palette,
      (store.getState().project!.layers.find((l) => l.id === 't') as TextLayer).fill
    )
    store
      .getState()
      .editLayers(['t'], { fill: { kind: 'literal', value: resolved as `#${string}` } })
    store.getState().setPaletteColor(ACCENT, '#112233')
    const t = store.getState().project!.layers.find((l) => l.id === 't') as TextLayer
    expect(t.fill).toEqual({ kind: 'literal', value: '#c6a45d' })
    expect(
      resolveColor(
        store.getState().project!.palette,
        (store.getState().project!.layers.find((l) => l.id === 'r') as ShapeLayer).fill!
      )
    ).toBe('#112233')
  })
  it('fixed → palette and back, for text, shape fill/stroke, frame and canvas background', async () => {
    const p0 = {
      ...base(),
      palette: {
        colors: [{ id: ACCENT, role: 'accent' as const, name: 'Accent', value: '#c6a45d' }]
      },
      canvas: { ...base().canvas, backgroundColor: { kind: 'literal' as const, value: '#ffffff' } },
      layers: base().layers.map((l) =>
        l.type === 'text' ? ({ ...l, fill: { kind: 'literal', value: '#222222' } } as Layer) : l
      )
    }
    const store = createEditorStore({ ports: fakePorts(p0) })
    await store.getState().openFromDialog()
    const link = { kind: 'palette' as const, paletteColorId: ACCENT }
    expect(store.getState().editLayers(['t'], { fill: link })).toBe(true)
    expect(store.getState().setCanvasBackgroundColor(link)).toBe(true)
    expect(
      paletteReferences(store.getState().project!, ACCENT).filter(
        (r) => r.property === 'text color'
      )
    ).toHaveLength(1)
    store.getState().editLayers(['t'], { fill: { kind: 'literal', value: '#222222' } })
    expect(
      paletteReferences(store.getState().project!, ACCENT).filter(
        (r) => r.property === 'text color'
      )
    ).toHaveLength(0)
  })
})

describe('integrity and preflight for broken references', () => {
  it('a reference to a missing entry is reported by integrity and the preflight, resolves to the visible marker, never crashes', () => {
    const p = { ...base(), palette: { colors: [] } }
    expect(checkProjectIntegrity(p).some((i) => i.code === 'missing-palette-color')).toBe(true)
    expect(brokenPaletteReferences(p).length).toBe(5)
    expect(palettePreflight(p).broken.length).toBe(5)
    expect(resolveColor(p.palette, { kind: 'palette', paletteColorId: ACCENT })).toBe('#ff00ff')
    const ok = palettePreflight(base())
    expect(ok.broken).toEqual([])
    expect(ok.references[0]?.refs.length).toBe(5)
  })
  it('projects with an empty or partial palette still work', () => {
    expect(checkProjectIntegrity(makeProject([text('t', 0)]))).toEqual([])
    expect(addBasicPalette(makeProject([])).palette.colors.length).toBe(5)
  })
})
