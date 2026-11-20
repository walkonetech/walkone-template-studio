import { describe, expect, it } from 'vitest'
import {
  checkProjectIntegrity,
  createProject,
  getPixelSize,
  type Layer,
  type TemplateProject
} from '@domain'
import {
  MAX_SCALE,
  MIN_SCALE,
  fitView,
  resolveView,
  screenToDesign
} from '@canvas/viewport/viewport'
import { planOutput } from '@canvas/rendering/composition'
import { createEditorStore, selectViewTransform } from '../store'
import {
  COMMANDS,
  MENUS,
  commandForKey,
  commandTip,
  shortcutLabel,
  type CommandId
} from '../commands'
import { TIPS } from '../tooltips'
import { TOOLS } from '../tools'
import { canStartSpacePan, isActivatableTarget, isTypingTarget } from '../spacePan'
import { addAssets, addAssetLayer } from '../assetMutations'
import { fakePorts, makeProject, photo, shape, T0 } from './helpers'

async function open(p: TemplateProject) {
  const store = createEditorStore({ ports: fakePorts(p) })
  await store.getState().openFromDialog()
  return { store, s: () => store.getState() }
}
const strip = (layers: Layer[] = []) => ({
  ...createProject({ name: 'S', design: 'strip-2x6-600', now: T0, createId: () => 'p' }),
  layers
})

describe('Show Overflow / clipped view is editor presentation only', () => {
  it('defaults to showing overflow; toggling is not dirty, not in history and does not touch the project', async () => {
    const { s } = await open(
      makeProject([shape('a', 0, { x: -400, y: -50, width: 900, height: 300 })])
    )
    expect(s().showOverflow).toBe(true)
    const project = s().project
    const saved = s().savedProject
    s().setShowOverflow(false)
    expect(s().showOverflow).toBe(false)
    expect(s().project).toBe(project)
    expect(s().savedProject).toBe(saved)
    expect(s().history.past).toHaveLength(0)
    expect(s().autosave.state).toBe('idle')
    s().setShowOverflow(true)
    expect(s().showOverflow).toBe(true)
  })
  it('survives opening another project (a view preference)', async () => {
    const { s } = await open(makeProject([]))
    s().setShowOverflow(false)
    await s().createProject({ name: 'N', preset: 'photo-4x6-portrait-600' })
    expect(s().showOverflow).toBe(false)
  })
})

describe('off-artboard geometry is valid and preserved (never clamped)', () => {
  const art = (over: Partial<Layer>): Layer =>
    shape('a', 0, { type: 'shape', ...over } as Partial<Layer>)
  it('negative X/Y and sizes beyond the canvas are valid and pass integrity', () => {
    const p = makeProject([art({ x: -4, y: -250, width: 5000, height: 9000 })])
    expect(checkProjectIntegrity(p)).toEqual([])
  })
  it('moving, grouping, aligning and duplicating never clamp child geometry to the artboard', async () => {
    const { s } = await open(
      makeProject([
        shape('a', 0, { x: -300, y: -300, width: 400, height: 400 }),
        shape('b', 1, { x: 2300, y: 3500, width: 400, height: 400 })
      ])
    )
    s().selectLayers(['a', 'b'])
    s().groupSelection()
    const g = s().project!.layers.find((l) => l.type === 'group')!
    expect([g.x, g.y]).toEqual([-300, -300])
    s().moveSelectionTo({ x: -900, y: -800 })
    expect(s().project!.layers.find((l) => l.id === 'a')!.x).toBe(-900)
    expect(s().alignSelection('left', 'selection')).toBe(true) // group alone: canvas-relative
    s().undo()
    s().duplicateSelection()
    expect(s().project!.layers.filter((l) => l.type === 'shape').length).toBe(4)
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })
  it('selection-relative align may leave everything off-artboard; only "to canvas" moves it inside', async () => {
    const { s } = await open(
      makeProject([
        shape('a', 0, { x: -500, y: 0, width: 100, height: 100 }),
        shape('b', 1, { x: -200, y: 300, width: 100, height: 100 })
      ])
    )
    s().selectLayers(['a', 'b'])
    s().alignSelection('left', 'selection')
    expect(s().project!.layers.map((l) => l.x)).toEqual([-500, -500])
    s().alignSelection('left', 'canvas')
    expect(s().project!.layers.map((l) => l.x)).toEqual([0, 0])
  })
  it('an imported asset keeps its full geometry when placed mostly outside', () => {
    const asset = {
      id: 'petals',
      filename: 'petals.png',
      mediaType: 'image/png' as const,
      path: 'assets/petals.png',
      pixelWidth: 3000,
      pixelHeight: 3000,
      source: { kind: 'upload' as const }
    }
    const base = addAssets(createProject({ name: 'x', design: 'strip-2x6-600', now: T0 }), [asset])
    const { project } = addAssetLayer(base, 'petals', { x: 1150, y: -100 })
    const moved = {
      ...project,
      layers: project.layers.map((l) => ({ ...l, x: -1100, y: -1400, width: 3000, height: 3000 }))
    }
    expect(checkProjectIntegrity(moved)).toEqual([])
    // the printable region still cuts it, but the model keeps it whole
    expect(moved.layers[0]!.width).toBeGreaterThan(1200)
  })
  it('each copy of a two-up sheet is clipped by its own cell; the overflow of copy 1 starts inside copy 2 only as geometry', () => {
    const p = strip([shape('a', 0, { x: 1150, y: 0, width: 200, height: 3600 })])
    const plan = planOutput(p)
    const [c1, c2] = plan.copies
    // geometry: copy 1's layer spans x 1150–1350, i.e. 150 px into copy 2's cell …
    expect(c1!.layers[0]!.x + c1!.layers[0]!.width).toBe(1350)
    expect(c2!.cell.x).toBe(1200)
    // … but copy 1 is drawn clipped to ITS cell (0–1200), so nothing of it appears in copy 2's area.
    expect(c1!.cell.x + c1!.cell.width).toBe(c2!.cell.x)
  })
})

describe('zoom: range, Fit, 100%, pointer-centred, geometry-independent, both modes', () => {
  it('range is 2% to 400% and clamps', async () => {
    expect(MIN_SCALE).toBe(0.02)
    expect(MAX_SCALE).toBe(4)
    const { s } = await open(makeProject([photo('p', 1)]))
    for (let i = 0; i < 60; i++) s().zoomIn()
    expect(selectViewTransform(s())!.scale).toBe(MAX_SCALE)
    for (let i = 0; i < 80; i++) s().zoomOut()
    expect(selectViewTransform(s())!.scale).toBe(MIN_SCALE)
  })
  it('Fit frames the whole artboard with padding; 100% is exactly 1:1 and centred', async () => {
    const { s } = await open(makeProject([]))
    s().setViewport({ width: 1000, height: 800 })
    const fit = selectViewTransform(s())!
    const px = getPixelSize(s().project!.canvas.print)
    expect(fit.scale).toBeCloseTo(fitView(px, { width: 1000, height: 800 }).scale, 9)
    expect(px.height * fit.scale).toBeLessThanOrEqual(800)
    s().zoomToActualSize()
    const one = selectViewTransform(s())!
    expect(one.scale).toBe(1)
    expect(one.offsetX).toBeCloseTo((1000 - px.width) / 2, 6)
    s().fitToWindow()
    expect(selectViewTransform(s())!.scale).toBeCloseTo(fit.scale, 9)
  })
  it('zooming at the pointer keeps the design point under the pointer (±1 design px)', async () => {
    const { s } = await open(makeProject([]))
    s().setViewport({ width: 1000, height: 800 })
    const anchor = { x: 420, y: 310 }
    const before = screenToDesign(selectViewTransform(s())!, anchor.x, anchor.y)
    s().zoomAtPoint(3, anchor)
    const after = screenToDesign(selectViewTransform(s())!, anchor.x, anchor.y)
    expect(after.x).toBeCloseTo(before.x, 6)
    expect(after.y).toBeCloseTo(before.y, 6)
  })
  it('zoom and pan never change project geometry, dirty state or history', async () => {
    const { s } = await open(makeProject([shape('a', 0, { x: -50, y: 20 })]))
    const project = s().project
    s().zoomIn()
    s().zoomOut()
    s().zoomToActualSize()
    s().panBy(120, -40)
    s().zoomAtPoint(2, { x: 10, y: 10 })
    s().fitToWindow()
    expect(s().project).toBe(project)
    expect(s().project).toBe(s().savedProject)
    expect(s().history.past).toHaveLength(0)
  })
  it('zoom and pan work in Print Preview too (framing the sheet)', async () => {
    const { s } = await open(strip([shape('a', 0)]))
    s().setViewport({ width: 1200, height: 800 })
    s().setViewMode('preview')
    const fit = selectViewTransform(s())!
    s().zoomIn()
    expect(selectViewTransform(s())!.scale).toBeGreaterThan(fit.scale)
    s().zoomToActualSize()
    expect(selectViewTransform(s())!.scale).toBe(1)
    s().panBy(50, 0)
    const manual = s().view
    expect(manual.mode).toBe('manual')
    expect(resolveView(manual, getPixelSize(s().project!.output.print), s().viewport).scale).toBe(1)
    expect(s().history.past).toHaveLength(0)
  })
})

describe('Space pan eligibility', () => {
  const ok = {
    code: 'Space',
    repeat: false,
    target: { tagName: 'DIV' },
    pointerOverWorkspace: false,
    hasModifier: false,
    editingText: false
  }
  it('starts on Space from a neutral target', () => {
    expect(canStartSpacePan(ok)).toBe(true)
  })
  it('is ignored while typing (inputs, textareas, selects, contenteditable)', () => {
    for (const target of [
      { tagName: 'INPUT' },
      { tagName: 'textarea' },
      { tagName: 'SELECT' },
      { tagName: 'DIV', isContentEditable: true },
      { tagName: 'DIV', role: 'textbox' }
    ]) {
      expect(canStartSpacePan({ ...ok, target })).toBe(false)
      expect(isTypingTarget(target)).toBe(true)
    }
    expect(canStartSpacePan({ ...ok, editingText: true })).toBe(false)
  })
  it('does not steal Space from a focused button unless the pointer is over the workspace', () => {
    expect(isActivatableTarget({ tagName: 'BUTTON' })).toBe(true)
    expect(canStartSpacePan({ ...ok, target: { tagName: 'BUTTON' } })).toBe(false)
    expect(
      canStartSpacePan({ ...ok, target: { tagName: 'BUTTON' }, pointerOverWorkspace: true })
    ).toBe(true)
    expect(canStartSpacePan({ ...ok, target: { tagName: 'DIV', role: 'radio' } })).toBe(false)
  })
  it('ignores other keys, key repeat and shortcuts', () => {
    expect(canStartSpacePan({ ...ok, code: 'KeyA' })).toBe(false)
    expect(canStartSpacePan({ ...ok, repeat: true })).toBe(false)
    expect(canStartSpacePan({ ...ok, hasModifier: true })).toBe(false)
  })
})

describe('tooltips derive from the command model', () => {
  const ids = Object.keys(COMMANDS) as CommandId[]
  it('every command has a label and a non-trivial hint', () => {
    for (const id of ids) {
      expect(COMMANDS[id].label.length).toBeGreaterThan(2)
      expect(COMMANDS[id].hint.length).toBeGreaterThan(10)
    }
  })
  it('advertised shortcuts are exactly the command definitions (both platforms) and really trigger the command', () => {
    for (const id of ids) {
      const sc = COMMANDS[id].shortcut
      expect(commandTip(id, true).shortcut).toBe(shortcutLabel(sc, true))
      expect(commandTip(id, false).shortcut).toBe(shortcutLabel(sc, false))
      if (!sc) continue
      const key = sc.match?.[0] ?? sc.key.toLowerCase()
      expect(commandForKey({ key, shiftKey: !!sc.shift }, !!sc.mod)).toBe(id)
    }
  })
  it('zoom, fit and 100% have the established cross-platform shortcuts', () => {
    expect(commandTip('view.zoomIn', true).shortcut).toBe('⌘+')
    expect(commandTip('view.zoomOut', false).shortcut).toBe('Ctrl+−')
    expect(commandTip('view.fit', true).shortcut).toBe('⌘0')
    expect(commandTip('view.actual', false).shortcut).toBe('Ctrl+1')
  })
  it('the tools the brief names are all described', () => {
    expect(COMMANDS['view.snap'].hint).toMatch(/snap/i)
    expect(COMMANDS['view.previewPhotos'].hint).toMatch(/sample photos/i)
    expect(COMMANDS['view.showOverflow'].hint).toMatch(/artboard/i)
    expect(COMMANDS['arrange.alignLeft'].hint).toMatch(/left/i)
    expect(COMMANDS['arrange.distributeV'].hint).toMatch(/vertical/i)
    expect(TIPS.move.hint).toMatch(/Shift/)
    expect(TIPS.pan.hint).toMatch(/Space/)
  })
  it('non-command tips are complete, and every rail category is real and described (no planned placeholders)', () => {
    for (const t of Object.values(TIPS)) {
      expect(t.label.length).toBeGreaterThan(2)
      expect(t.hint.length).toBeGreaterThan(10)
    }
    for (const t of TOOLS) expect(t.hint.length).toBeGreaterThan(10)
    expect(JSON.stringify(TOOLS)).not.toMatch(/later phase|coming soon/i)
  })
  it('the View menu carries Show overflow and Preview/Shuffle photos', () => {
    const view = MENUS.find((m) => m.id === 'view')!.items
    expect(view).toContain('view.showOverflow')
    expect(view).toContain('view.previewPhotos')
    expect(view).toContain('view.shufflePhotos')
  })
})

describe('preview photos and crop are editor state', () => {
  const photos = () => makeProject([photo('p1', 1), photo('p2', 2), photo('p3', 3)])
  it('Preview Photos ON/OFF is not dirty and not in history', async () => {
    const { s } = await open(photos())
    const project = s().project
    s().setPhotoDisplay('preview')
    expect(s().photoDisplay).toBe('preview')
    expect(s().project).toBe(project)
    expect(s().history.past).toHaveLength(0)
    s().setPhotoDisplay('placeholder')
    expect(s().project).toBe(s().savedProject)
  })
  it('shuffle, reset, choose sample and crop never touch the project, history or dirty state', async () => {
    const { s } = await open(photos())
    const project = s().project
    s().shufflePhotos()
    s().setSampleFor(2, 'sample-city')
    s().setPhotoCrop('p1', { zoom: 2, x: 0.5, y: -0.5 })
    expect(s().previewPhotos.overrides[2]).toBe('sample-city')
    s().resetSamples()
    expect(s().previewPhotos.seed).toBe(0)
    expect(s().photoCrops['p1']).toEqual({ zoom: 2, x: 0.5, y: -0.5 })
    s().resetPhotoCrop('p1')
    expect(s().photoCrops['p1']).toBeUndefined()
    expect(s().project).toBe(project)
    expect(s().history.past).toHaveLength(0)
    expect(s().autosave.state).toBe('idle')
  })
  it('crops are clamped and keyed by LAYER (so every derived copy shares them)', async () => {
    const { s } = await open(photos())
    s().setPhotoCrop('p1', { zoom: 99, x: 7, y: -7 })
    expect(s().photoCrops['p1']).toEqual({ zoom: 4, x: 1, y: -1 })
    const plan = planOutput(strip([photo('p1', 1) as Layer]))
    expect(plan.copies.map((c) => c.layers[0]!.id)).toEqual(['p1', 'p1'])
  })
  it('Reposition mode: begin enables preview and selects; commit keeps; Escape (cancel) restores; selecting leaves it', async () => {
    const { s } = await open(photos())
    s().setPhotoCrop('p1', { zoom: 1.5, x: 0.2, y: 0 })
    expect(s().beginCrop('p1')).toBe(true)
    expect(s().photoDisplay).toBe('preview')
    expect(s().selectedIds).toEqual(['p1'])
    expect(s().interaction).toBe('cropping')
    s().setPhotoCrop('p1', { zoom: 3, x: -1, y: 1 })
    s().cancelCrop()
    expect(s().photoCrops['p1']).toEqual({ zoom: 1.5, x: 0.2, y: 0 })
    expect(s().cropSession).toBeNull()
    expect(s().interaction).toBe('idle')
    s().beginCrop('p2')
    s().setPhotoCrop('p2', { zoom: 2, x: 0, y: 0 })
    s().commitCrop()
    expect(s().photoCrops['p2']).toEqual({ zoom: 2, x: 0, y: 0 })
    s().beginCrop('p3')
    s().selectLayer('p1')
    expect(s().cropSession).toBeNull()
    expect(s().interaction).toBe('idle')
  })
  it('cancel on a layer that had no crop removes the crop; non-photo layers cannot be repositioned; nudging is paused', async () => {
    const { s } = await open(makeProject([photo('p1', 1), shape('r', 1)]))
    s().beginCrop('p1')
    s().setPhotoCrop('p1', { zoom: 2, x: 1, y: 0 })
    s().cancelCrop()
    expect(s().photoCrops['p1']).toBeUndefined()
    expect(s().beginCrop('r')).toBe(false)
    s().beginCrop('p1')
    expect(s().nudgeSelection(5, 5)).toBe(false)
  })
  it('Reposition is a Design-mode tool (not in Print Preview)', async () => {
    const { s } = await open(strip([photo('p1', 1)]))
    s().setViewMode('preview')
    expect(s().beginCrop('p1')).toBe(false)
  })
  it('crop state resets for a new project', async () => {
    const { s } = await open(photos())
    s().setPhotoCrop('p1', { zoom: 2, x: 0, y: 0 })
    s().shufflePhotos()
    await s().createProject({ name: 'N', preset: 'photo-4x6-portrait-600' })
    expect(s().photoCrops).toEqual({})
    expect(s().previewPhotos.seed).toBe(0)
  })
})
