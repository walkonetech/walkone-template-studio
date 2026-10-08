import { describe, expect, it } from 'vitest'
import { type Layer, type TemplateProject } from '@domain'
import {
  alignLayers,
  arrangeTargets,
  distributeLayers,
  layerBounds,
  moveSelectionTo,
  selectionBounds
} from '../arrange'
import { NUDGE_PX, NUDGE_SHIFT_PX, nudgeDelta } from '../nudge'
import { createEditorStore, selectViewMode, selectViewTransform } from '../store'
import { describeWorkspace } from '../describe'
import { describeNewProject, presetIdFor } from '../welcome'
import { COMMANDS, isCommandEnabled, type CommandContext } from '../commands'
import { fakePorts, group, makeProject, photo, shape, T0 } from './helpers'
import { createProject } from '@domain'

const at = (p: TemplateProject, id: string): Layer => p.layers.find((l) => l.id === id) as Layer
const box = (p: TemplateProject, id: string): number[] => {
  const b = layerBounds(at(p, id))
  return [b.x, b.y, b.width, b.height]
}

// Three boxes with different sizes, scattered.
const scene = (): TemplateProject =>
  makeProject([
    shape('a', 0, { x: 100, y: 50, width: 200, height: 100 }),
    shape('b', 1, { x: 400, y: 300, width: 100, height: 300 }),
    shape('c', 2, { x: 900, y: 120, width: 300, height: 50 })
  ])
const ALL = ['a', 'b', 'c']

describe('exact selection position', () => {
  it('X moves the whole selection and keeps relative spacing', () => {
    const p = scene()
    const q = moveSelectionTo(p, ALL, { x: 0 })
    expect(selectionBounds(q, ALL)?.x).toBe(0)
    expect(at(q, 'a').x).toBe(0)
    expect(at(q, 'b').x - at(q, 'a').x).toBe(300)
    expect(at(q, 'c').x - at(q, 'b').x).toBe(500)
    expect(at(q, 'a').y).toBe(50) // Y untouched
  })
  it('Y moves the whole selection', () => {
    const q = moveSelectionTo(scene(), ALL, { y: 1000 })
    expect(selectionBounds(q, ALL)?.y).toBe(1000)
    expect(at(q, 'b').y - at(q, 'a').y).toBe(250)
  })
  it('sizes and rotations never change', () => {
    const p = makeProject([shape('a', 0, { rotation: 20 }), shape('b', 1, { x: 600 })])
    const q = moveSelectionTo(p, ['a', 'b'], { x: -50, y: 7 })
    for (const id of ['a', 'b']) {
      expect([at(q, id).width, at(q, id).height, at(q, id).rotation]).toEqual([
        at(p, id).width,
        at(p, id).height,
        at(p, id).rotation
      ])
    }
  })
  it('a group moves as a whole: children translated, derived box follows, no double-move with a selected child', () => {
    const p = makeProject([
      group('g', 0, { x: 1000, y: 1000, width: 400, height: 300 }),
      shape('g-a', 0, { parentId: 'g', x: 1000, y: 1000, width: 200, height: 300 }),
      shape('g-b', 1, { parentId: 'g', x: 1200, y: 1000, width: 200, height: 300 })
    ])
    const q = moveSelectionTo(p, ['g', 'g-a'], { x: 0, y: 0 })
    expect(at(q, 'g-a').x).toBe(0)
    expect(at(q, 'g-b').x).toBe(200)
    expect([at(q, 'g').x, at(q, 'g').y, at(q, 'g').width, at(q, 'g').height]).toEqual([
      0, 0, 400, 300
    ])
  })
  it('skips locked layers', () => {
    const p = makeProject([shape('a', 0, { locked: true }), shape('b', 1, { x: 500 })])
    expect(arrangeTargets(p, ['a', 'b']).map((l) => l.id)).toEqual(['b'])
    const q = moveSelectionTo(p, ['a', 'b'], { x: 0 })
    expect(at(q, 'a').x).toBe(at(p, 'a').x)
    expect(at(q, 'b').x).toBe(0)
  })
})

describe('align', () => {
  it('left / center / right to the selection', () => {
    const left = alignLayers(scene(), ALL, 'left', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(left, i)[0])).toEqual([100, 100, 100])
    const right = alignLayers(scene(), ALL, 'right', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(right, i)[0]! + box(right, i)[2]!)).toEqual([
      1200, 1200, 1200
    ])
    const center = alignLayers(scene(), ALL, 'hcenter', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(center, i)[0]! + box(center, i)[2]! / 2)).toEqual([
      650, 650, 650
    ])
  })
  it('top / middle / bottom to the selection', () => {
    const top = alignLayers(scene(), ALL, 'top', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(top, i)[1])).toEqual([50, 50, 50])
    const bottom = alignLayers(scene(), ALL, 'bottom', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(bottom, i)[1]! + box(bottom, i)[3]!)).toEqual([
      600, 600, 600
    ])
    const mid = alignLayers(scene(), ALL, 'vcenter', 'selection')
    expect(['a', 'b', 'c'].map((i) => box(mid, i)[1]! + box(mid, i)[3]! / 2)).toEqual([
      325, 325, 325
    ])
  })
  it('align only translates: sizes are unchanged, rotated layers use their visible bounds', () => {
    const p = makeProject([
      shape('r', 0, { x: 100, y: 100, width: 200, height: 100, rotation: 90 }),
      shape('s', 1, { x: 500, y: 0 })
    ])
    const q = alignLayers(p, ['r', 's'], 'left', 'selection')
    expect(layerBounds(at(q, 'r')).x).toBeCloseTo(layerBounds(at(q, 's')).x, 6)
    expect(at(q, 'r').width).toBe(200)
  })
  it('to the canvas (also for a single layer); selection needs two layers', () => {
    const p = scene()
    const one = alignLayers(p, ['a'], 'hcenter', 'canvas')
    expect(box(one, 'a')[0]! + box(one, 'a')[2]! / 2).toBe(1200) // 2400-wide canvas
    expect(alignLayers(p, ['a'], 'left', 'selection')).toBe(p)
    const bottom = alignLayers(p, ['a'], 'bottom', 'canvas')
    expect(box(bottom, 'a')[1]! + box(bottom, 'a')[3]!).toBe(3600)
  })
  it('a group and its selected child are not moved twice', () => {
    const p = makeProject([
      group('g', 0, { x: 500, y: 0, width: 200, height: 100 }),
      shape('k', 0, { parentId: 'g', x: 500, y: 0, width: 200, height: 100 }),
      shape('s', 1, { x: 0, y: 300, width: 100, height: 100 })
    ])
    const q = alignLayers(p, ['g', 'k', 's'], 'left', 'selection')
    expect(at(q, 'k').x).toBe(0)
    expect(at(q, 's').x).toBe(0)
  })
})

describe('distribute', () => {
  it('horizontal: outer items stay, gaps between become equal', () => {
    const q = distributeLayers(scene(), ALL, 'horizontal')
    expect(box(q, 'a')[0]).toBe(100)
    expect(box(q, 'c')[0]! + box(q, 'c')[2]!).toBe(1200)
    const gap1 = box(q, 'b')[0]! - (box(q, 'a')[0]! + box(q, 'a')[2]!)
    const gap2 = box(q, 'c')[0]! - (box(q, 'b')[0]! + box(q, 'b')[2]!)
    expect(gap1).toBe(gap2)
    expect(gap1).toBe((1100 - 600) / 2)
  })
  it('vertical: equal gaps, outer items stay', () => {
    const p = makeProject([
      shape('a', 0, { x: 0, y: 0, width: 50, height: 100 }),
      shape('b', 1, { x: 0, y: 130, width: 50, height: 200 }),
      shape('c', 2, { x: 0, y: 900, width: 50, height: 100 })
    ])
    const q = distributeLayers(p, ['a', 'b', 'c'], 'vertical')
    expect(box(q, 'a')[1]).toBe(0)
    expect(box(q, 'c')[1]! + box(q, 'c')[3]!).toBe(1000)
    const g1 = box(q, 'b')[1]! - 100
    const g2 = box(q, 'c')[1]! - (box(q, 'b')[1]! + 200)
    expect(g1).toBe(g2)
  })
  it('is independent of selection order and needs three layers', () => {
    const p = scene()
    expect(distributeLayers(p, ['c', 'a', 'b'], 'horizontal').layers.map((l) => l.x)).toEqual(
      distributeLayers(p, ALL, 'horizontal').layers.map((l) => l.x)
    )
    expect(distributeLayers(p, ['a', 'b'], 'horizontal')).toBe(p)
  })
})

describe('store: arrange, undo/redo, dirty', () => {
  async function open() {
    const ports = fakePorts(scene())
    const store = createEditorStore({ ports, createId: () => 'x' })
    await store.getState().openFromDialog()
    return { store, s: () => store.getState() }
  }
  it('each operation is ONE history entry and undo/redo restore exactly', async () => {
    const { s } = await open()
    const original = s().project
    s().selectLayers(ALL)
    expect(s().alignSelection('left')).toBe(true)
    expect(s().history.past).toHaveLength(1)
    expect(s().distributeSelection('vertical')).toBe(true)
    expect(s().moveSelectionTo({ x: 10, y: 20 })).toBe(true)
    expect(s().history.past).toHaveLength(3)
    s().undo()
    s().undo()
    s().undo()
    expect(s().project).toBe(original)
    s().redo()
    expect(at(s().project!, 'a').x).toBe(100)
  })
  it('marks the project modified and refuses distribute with fewer than three', async () => {
    const { s } = await open()
    s().selectLayers(['a', 'b'])
    expect(s().distributeSelection('horizontal')).toBe(false)
    expect(s().history.past).toHaveLength(0)
    expect(s().alignSelection('left')).toBe(true)
    expect(s().project).not.toBe(s().savedProject)
  })
})

describe('nudging is in design pixels at every zoom', () => {
  it('arrow = 1, shift+arrow = 10, independent of the key repeat count semantics', () => {
    expect(NUDGE_PX).toBe(1)
    expect(NUDGE_SHIFT_PX).toBe(10)
    expect(nudgeDelta('ArrowRight', false)).toEqual({ dx: 1, dy: 0 })
    expect(nudgeDelta('ArrowLeft', true)).toEqual({ dx: -10, dy: 0 })
    expect(nudgeDelta('ArrowUp', false)).toEqual({ dx: 0, dy: -1 })
    expect(nudgeDelta('ArrowDown', true)).toEqual({ dx: 0, dy: 10 })
    expect(nudgeDelta('a', false)).toBeNull()
  })
  it('moves a layer by exactly the same design distance at 20%, 100% and 400% zoom', async () => {
    const ports = fakePorts(makeProject([shape('a', 0, { x: 500, y: 500 })]))
    const store = createEditorStore({ ports })
    await store.getState().openFromDialog()
    const s = (): ReturnType<typeof store.getState> => store.getState()
    s().selectLayer('a')
    const xs: number[] = [500]
    for (const zoom of [0.2, 1, 4]) {
      s().zoomToActualSize()
      for (let i = 0; i < 4 && (selectViewTransform(s())?.scale ?? 0) < zoom * 0.99; i++)
        s().zoomIn()
      for (let i = 0; i < 12 && (selectViewTransform(s())?.scale ?? 9) > zoom * 1.01; i++)
        s().zoomOut()
      const d = nudgeDelta('ArrowRight', true)!
      s().nudgeSelection(d.dx, d.dy)
      xs.push(at(s().project!, 'a').x)
    }
    expect(xs).toEqual([500, 510, 520, 530])
  })
})

describe('workspace view mode', () => {
  const strip = () => ({
    ...createProject({ name: 'S', design: 'strip-2x6-600', now: T0, createId: () => 'p' }),
    layers: [photo('p1', 1)]
  })
  async function open(p: TemplateProject) {
    const ports = fakePorts(p)
    const store = createEditorStore({ ports })
    await store.getState().openFromDialog()
    return { store, s: () => store.getState() }
  }
  it('switching modes is not dirty, not in history, and keeps the project object', async () => {
    const { s } = await open(strip())
    const project = s().project
    const saved = s().savedProject
    s().setViewMode('preview')
    expect(selectViewMode(s())).toBe('preview')
    expect(s().project).toBe(project)
    expect(s().savedProject).toBe(saved)
    expect(s().history.past).toHaveLength(0)
    s().setViewMode('design')
    expect(selectViewMode(s())).toBe('design')
    expect(s().autosave.state).toBe('idle')
  })
  it('Print Preview frames the 4×6 sheet and is read-only', async () => {
    const { s } = await open(strip())
    s().setViewMode('preview')
    const t = selectViewTransform(s())!
    s().zoomToActualSize()
    expect(selectViewTransform(s())?.scale).toBe(1)
    expect(t.scale).toBeGreaterThan(0)
    s().selectLayer('p1')
    expect(s().nudgeSelection(5, 5)).toBe(false)
    expect(s().deleteSelection()).toBe(false)
    expect(s().lastMessage).toMatch(/read-only/i)
    expect(s().history.past).toHaveLength(0)
  })
  it('a project without derived copies never enters Print Preview', async () => {
    const { s } = await open(makeProject([photo('p1', 1)]))
    s().setViewMode('preview')
    expect(selectViewMode(s())).toBe('design')
    expect(s().nudgeSelection(1, 1)).toBe(false) // no selection; but design mode would not warn
  })
  it('opening another project returns to Design', async () => {
    const { s } = await open(strip())
    s().setViewMode('preview')
    await s().createProject({ name: 'N', preset: 'strip-2x6-600' })
    expect(s().viewMode).toBe('design')
  })
})

describe('status text, new-project choices and commands', () => {
  const strip = createProject({ name: 'S', design: 'strip-2x6-600', now: T0 })
  it('strip projects describe design and sheet separately', () => {
    expect(describeWorkspace(strip, 'design')).toBe('2×6 Strip • 600 DPI • Design 1200×3600 px')
    expect(describeWorkspace(strip, 'preview')).toBe('4×6 Output • 2-up • 2400×3600 px')
    const normal = createProject({ name: 'N', design: 'photo-4x6-portrait-600', now: T0 })
    expect(describeWorkspace(normal, 'preview')).toBe('4×6 Portrait • 600 DPI • 2400×3600 px')
  })
  it('New Project choices map to presets and explain the strip workflow', () => {
    expect(presetIdFor('photo-4x6', 'landscape', 300)).toBe('photo-4x6-landscape-300')
    expect(presetIdFor('photo-4x6', 'portrait', 600)).toBe('photo-4x6-portrait-600')
    expect(presetIdFor('strip-2x6', 'landscape', 300)).toBe('strip-2x6-300')
    const info = describeNewProject('strip-2x6', 'portrait', 600)
    expect(info.design).toContain('1200×3600')
    expect(info.sheet).toContain('2400×3600')
    expect(info.note).toMatch(/Design one 2×6 strip.*two identical copies.*4×6 print sheet/)
    expect(info.note).toMatch(/2-inch center cut/)
    expect(describeNewProject('photo-4x6', 'portrait', 300).sheet).toBeNull()
  })
  it('align/distribute commands are enabled by selection and only in Design', () => {
    const ctx = (o: Partial<CommandContext>): CommandContext => ({
      hasProject: true,
      canUndo: false,
      canRedo: false,
      selectionCount: 0,
      snapping: true,
      previewPhotos: false,
      hasPrintPreview: true,
      viewMode: 'design',
      ...o
    })
    expect(isCommandEnabled('arrange.alignLeft', ctx({ selectionCount: 0 }))).toBe(false)
    expect(isCommandEnabled('arrange.alignLeft', ctx({ selectionCount: 1 }))).toBe(true)
    expect(isCommandEnabled('arrange.distributeH', ctx({ selectionCount: 2 }))).toBe(false)
    expect(isCommandEnabled('arrange.distributeH', ctx({ selectionCount: 3 }))).toBe(true)
    expect(
      isCommandEnabled('arrange.alignLeft', ctx({ selectionCount: 3, viewMode: 'preview' }))
    ).toBe(false)
    expect(isCommandEnabled('view.printPreview', ctx({ hasPrintPreview: false }))).toBe(false)
    expect(COMMANDS['arrange.alignCenter'].label).toMatch(/center/i)
  })
})
