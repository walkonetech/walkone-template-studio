import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, sortedSiblings, type Layer } from '@domain'
import { planRender } from '../../canvas/rendering/plan'
import { buildPanelRows, layerTypeLabel } from '../layerTree'
import { group, makeProject, photo, scene, shape, text } from './helpers'

const names = (rows: ReturnType<typeof buildPanelRows>): string[] => rows.map((r) => r.layer.id)

describe('Layers Panel order (top of panel = front of artwork)', () => {
  it('lists siblings front-first: the reverse of canvas paint order', () => {
    const p = scene()
    const rows = buildPanelRows(p.layers)
    const topLevel = rows.filter((r) => r.depth === 0).map((r) => r.layer.id)
    const paint = sortedSiblings(p.layers, undefined).map((l) => l.id)
    expect(topLevel).toEqual([...paint].reverse())
  })

  it('agrees with the canvas renderer at every level (panel = reverse of the plan, per sibling set)', () => {
    const p = scene()
    const plan = planRender(p).layers.map((l) => l.id)
    const rows = buildPanelRows(p.layers)
    // for each parent: relative order in the plan (back->front) must be the reverse of the panel order
    for (const parent of [undefined, 'g']) {
      const panel = rows.filter((r) => r.layer.parentId === parent).map((r) => r.layer.id)
      const painted = plan.filter((id) => p.layers.find((l) => l.id === id)?.parentId === parent)
      expect(panel).toEqual([...painted].reverse())
    }
  })

  it('places children directly under their group, indented, also front-first', () => {
    const rows = buildPanelRows(scene().layers)
    const g = rows.findIndex((r) => r.layer.id === 'g')
    expect(rows[g + 1]).toMatchObject({ depth: 1 })
    expect(rows.slice(g + 1, g + 3).map((r) => r.layer.id)).toEqual(['g-b', 'g-a']) // g-b has the higher zIndex
    expect(rows[g]).toMatchObject({ hasChildren: true, depth: 0 })
  })

  it('breaks zIndex ties exactly like the canvas (array order), deterministically', () => {
    const tied = makeProject([shape('a', 1), shape('b', 1), shape('c', 0)])
    expect(names(buildPanelRows(tied.layers))).toEqual(['b', 'a', 'c'])
    expect(planRender(tied).layers.map((l) => l.id)).toEqual(['c', 'a', 'b'])
  })

  it('nested groups produce nested depth', () => {
    const p = makeProject([
      group('outer', 0),
      group('inner', 0, { parentId: 'outer' }),
      shape('leaf', 0, { parentId: 'inner' })
    ])
    expect(buildPanelRows(p.layers).map((r) => [r.layer.id, r.depth])).toEqual([
      ['outer', 0],
      ['inner', 1],
      ['leaf', 2]
    ])
  })

  it('collapsed groups hide descendants without touching the project', () => {
    const p = scene()
    const before = JSON.stringify(p)
    const rows = buildPanelRows(p.layers, { collapsed: new Set(['g']) })
    expect(rows.some((r) => r.layer.id === 'g-a')).toBe(false)
    expect(rows.find((r) => r.layer.id === 'g')?.collapsed).toBe(true)
    expect(JSON.stringify(p)).toBe(before)
  })

  it('direct versus inherited lock/visibility flags are distinguished', () => {
    const p = scene()
    const layers = p.layers.map((l) =>
      l.id === 'g' ? ({ ...l, locked: true, visible: false } as Layer) : l
    )
    const child = buildPanelRows(layers).find((r) => r.layer.id === 'g-a')!
    expect(child).toMatchObject({
      directLocked: false,
      lockedByAncestor: true,
      effectivelyLocked: true,
      directVisible: true,
      hiddenByAncestor: true,
      effectivelyVisible: false
    })
    const grp = buildPanelRows(layers).find((r) => r.layer.id === 'g')!
    expect(grp).toMatchObject({
      directLocked: true,
      lockedByAncestor: false,
      effectivelyLocked: true
    })
  })

  it('filter keeps matches and their ancestors, ignoring collapse', () => {
    const rows = buildPanelRows(scene().layers, { filter: 'g-a', collapsed: new Set(['g']) })
    expect(names(rows)).toEqual(['g', 'g-a'])
    expect(buildPanelRows(scene().layers, { filter: 'zzz' })).toEqual([])
    expect(
      buildPanelRows(scene().layers, { filter: 'PHOTO' }).filter((r) => r.layer.type === 'photo')
    ).toHaveLength(3)
  })

  it('works with 50 layers and stays deterministic', () => {
    const many = makeProject(Array.from({ length: 50 }, (_, i) => shape(`s${i}`, i)))
    const rows = buildPanelRows(many.layers)
    expect(rows).toHaveLength(50)
    expect(rows[0]?.layer.id).toBe('s49')
    expect(rows[49]?.layer.id).toBe('s0')
    expect(checkProjectIntegrity(many)).toEqual([])
  })

  it('type labels distinguish layer kinds and image roles', () => {
    expect(layerTypeLabel(photo('p', 1))).toBe('Photo')
    expect(layerTypeLabel(text('t', 0))).toBe('Text')
    expect(layerTypeLabel(shape('s', 0))).toBe('Rectangle')
    expect(layerTypeLabel(group('g', 0))).toBe('Group')
    const img = {
      ...shape('i', 0),
      type: 'image',
      assetId: 'a',
      role: 'overlay',
      fit: 'cover'
    } as unknown as Layer
    expect(layerTypeLabel(img)).toBe('Image · overlay')
  })
})
