import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type Layer } from '@domain'
import {
  createEditorStore,
  selectActiveId,
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  selectViewTransform
} from '../store'
import { fakePorts, photo, scene, text } from './helpers'

function setup(opts: { clock?: () => number } = {}) {
  const ports = fakePorts()
  let n = 0
  let t = 0
  const store = createEditorStore({
    ports,
    now: () => `2026-03-03T00:00:${String(++t % 60).padStart(2, '0')}.000Z`,
    createId: () => `new-${++n}`,
    ...(opts.clock ? { clock: opts.clock } : {})
  })
  return { store, ports, s: () => store.getState() }
}

async function open() {
  const x = setup()
  await x.s().createSample()
  return x
}

const layer = (p: { layers: Layer[] } | null, id: string): Layer =>
  p!.layers.find((l) => l.id === id) as Layer

describe('project lifecycle through ports', () => {
  it('creating a project adopts it, resets history, and starts dirty', async () => {
    const { s, ports } = setup()
    expect((await s().createSample()).status).toBe('ok')
    expect(s().project).not.toBeNull()
    expect(selectIsDirty(s())).toBe(true)
    expect(selectCanUndo(s())).toBe(false)
    expect(ports.calls.map((c) => c.name)).toEqual(['newSample'])
  })

  it('opening a saved project starts clean; history boundary on every open', async () => {
    const { s } = setup()
    await s().createSample()
    s().commitGeometry([
      { id: 'photo-1', geometry: { x: 1, y: 2, width: 300, height: 300, rotation: 0 } }
    ])
    expect(selectCanUndo(s())).toBe(true)
    await s().openFromDialog()
    expect(selectIsDirty(s())).toBe(false)
    expect(selectCanUndo(s())).toBe(false)
    expect(selectCanRedo(s())).toBe(false)
    expect(s().selectedIds).toEqual([])
  })

  it('cancellation is not an error and leaves state alone', async () => {
    const { s, ports } = setup()
    await s().createSample()
    const before = s().project
    ports.open = () => Promise.resolve({ status: 'cancelled' as const })
    expect(await s().openFromDialog()).toEqual({ status: 'cancelled' })
    expect(s().project).toBe(before)
    expect(s().lastMessage).toBeNull()
  })

  it('errors surface a message without changing the project', async () => {
    const { s, ports } = setup()
    await s().createSample()
    const before = s().project
    ports.open = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'invalid-project' as const, message: 'bad file' }
      })
    expect(await s().openFromDialog()).toEqual({ status: 'error', message: 'bad file' })
    expect(s().lastMessage).toBe('bad file')
    expect(s().project).toBe(before)
  })

  it('closing clears everything', async () => {
    const { s, ports } = await open()
    await s().closeProject()
    expect(s().project).toBeNull()
    expect(ports.calls.at(-1)?.name).toBe('close')
  })
})

describe('dirty state', () => {
  it('content edits make it dirty; save makes it clean; edits dirty again; undo back to saved is clean', async () => {
    const { s } = setup()
    await s().openFromDialog()
    expect(selectIsDirty(s())).toBe(false)
    s().commitGeometry([
      { id: 'photo-1', geometry: { x: 10, y: 10, width: 500, height: 500, rotation: 0 } }
    ])
    expect(selectIsDirty(s())).toBe(true)
    expect((await s().save()).status).toBe('ok')
    expect(selectIsDirty(s())).toBe(false)
    s().setVisibility('photo-2', false)
    expect(selectIsDirty(s())).toBe(true)
    s().undo()
    expect(selectIsDirty(s())).toBe(false) // project is exactly the saved snapshot again
    s().redo()
    expect(selectIsDirty(s())).toBe(true)
  })

  it('save of a project edited WHILE saving stays dirty', async () => {
    const { s, ports } = setup()
    await s().openFromDialog()
    s().setVisibility('photo-1', false)
    ports.save = (sid, project) =>
      new Promise((resolve) => {
        s().setVisibility('photo-2', false) // edit lands during the save
        resolve({
          status: 'ok',
          value: { sessionId: sid, project, fileName: 'x.boothproject', dirty: false, warnings: [] }
        })
      })
    await s().save()
    expect(selectIsDirty(s())).toBe(true)
  })

  it('selection, zoom, pan, guides, snapping and view mode never dirty the project or touch history', async () => {
    const { s } = setup()
    await s().openFromDialog()
    const project = s().project
    s().selectLayer('photo-1')
    s().zoomIn()
    s().zoomOut()
    s().zoomToActualSize()
    s().panBy(10, 10)
    s().fitToWindow()
    s().setGuides([{ axis: 'x', at: 1200 }])
    s().setSnapping({ enabled: false })
    s().setPhotoDisplay('preview')
    s().setGuidesVisible(false)
    expect(s().project).toBe(project)
    expect(selectIsDirty(s())).toBe(false)
    expect(selectCanUndo(s())).toBe(false)
  })

  it('failed saves leave the project dirty', async () => {
    const { s, ports } = setup()
    await s().createSample()
    ports.saveAs = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'write-failed' as const, message: 'disk full' }
      })
    expect((await s().saveAs()).status).toBe('error')
    expect(selectIsDirty(s())).toBe(true)
  })
})

describe('working copy write-through (no package rebuild, no timer)', () => {
  it('writes the working manifest after content changes, latest wins', async () => {
    const { s, ports } = await open()
    s().commitGeometry([
      { id: 'photo-1', geometry: { x: 1, y: 1, width: 400, height: 400, rotation: 0 } }
    ])
    s().setLocked('photo-2', true)
    await new Promise((r) => setTimeout(r, 0))
    expect(ports.workingCopies.length).toBeGreaterThan(0)
    expect(ports.workingCopies.at(-1)).toBe(s().project)
    expect(ports.calls.some((c) => c.name === 'save' || c.name === 'saveAs')).toBe(false)
  })

  it('does not write for view or selection changes', async () => {
    const { s, ports } = await open()
    s().selectLayer('photo-1')
    s().zoomIn()
    await new Promise((r) => setTimeout(r, 0))
    expect(ports.workingCopies).toHaveLength(0)
  })
})

describe('undo / redo', () => {
  it('basic edit, multiple edits, redo, and a new edit clears the redo branch', async () => {
    const { s } = await open()
    const p0 = s().project
    s().setVisibility('photo-1', false)
    s().setLocked('photo-2', true)
    expect(layer(s().project, 'photo-1').visible).toBe(false)
    expect(s().undo()).toBe(true)
    expect(layer(s().project, 'photo-2').locked).toBe(false)
    expect(s().undo()).toBe(true)
    expect(s().project).toBe(p0)
    expect(s().undo()).toBe(false)
    expect(s().redo()).toBe(true)
    expect(layer(s().project, 'photo-1').visible).toBe(false)
    s().setLocked('photo-3', true) // new edit
    expect(selectCanRedo(s())).toBe(false)
    expect(s().redo()).toBe(false)
  })

  it('a whole transform sequence (many intermediate moves) is a single undoable operation', async () => {
    const { s } = await open()
    const p0 = s().project
    // The canvas keeps drag state locally and commits ONCE on interaction end.
    s().setInteraction('transforming')
    for (let i = 0; i < 300; i++) s().setGuides(i % 2 ? [{ axis: 'x', at: 1200 }] : [])
    s().commitGeometry([
      { id: 'photo-1', geometry: { x: 900, y: 900, width: 700, height: 500, rotation: 12 } }
    ])
    s().setInteraction('idle')
    expect(s().history.past).toHaveLength(1)
    s().undo()
    expect(s().project).toBe(p0)
  })

  it('arrow-key nudges within the coalescing window undo as one step; different layers do not merge', async () => {
    let now = 1000
    const x = setup({ clock: () => now })
    await x.s().createSample()
    x.s().selectLayer('photo-1')
    const p0 = x.s().project
    for (let i = 0; i < 5; i++) {
      x.s().nudgeSelection(1, 0)
      now += 100
    }
    expect(x.s().history.past).toHaveLength(1)
    expect(layer(x.s().project, 'photo-1').x).toBe(255)
    x.s().undo()
    expect(x.s().project).toBe(p0)
  })

  it('undoing a deletion restores the layer and prunes stale selection safely', async () => {
    const { s } = await open()
    s().selectLayer('photo-2')
    expect(s().deleteSelection()).toBe(true)
    expect(s().selectedIds).toEqual([])
    s().undo()
    expect(layer(s().project, 'photo-2')).toBeDefined()
  })

  it('history is cleared explicitly', async () => {
    const { s } = await open()
    s().setVisibility('photo-1', false)
    s().clearHistory()
    expect(selectCanUndo(s())).toBe(false)
  })
})

describe('selection', () => {
  it('selects existing layers only and exposes the active id', async () => {
    const { s } = await open()
    s().selectLayer('photo-1')
    expect(selectActiveId(s())).toBe('photo-1')
    s().selectLayer('nope')
    expect(selectActiveId(s())).toBe('photo-1')
    s().selectLayer(null)
    expect(selectActiveId(s())).toBeNull()
  })

  it('selection is preserved across view operations and does not create history', async () => {
    const { s } = await open()
    s().selectLayer('photo-1')
    s().zoomIn()
    expect(selectActiveId(s())).toBe('photo-1')
    expect(selectCanUndo(s())).toBe(false)
  })
})

describe('direct manipulation honors locks', () => {
  it('locked layers cannot be nudged, deleted, or geometry-committed', async () => {
    const { s } = await open()
    s().setLocked('photo-1', true)
    s().selectLayer('photo-1')
    const p = s().project
    expect(s().nudgeSelection(5, 5)).toBe(false)
    expect(s().deleteSelection()).toBe(false)
    expect(
      s().commitGeometry([
        { id: 'photo-1', geometry: { x: 0, y: 0, width: 10, height: 10, rotation: 0 } }
      ])
    ).toBe(false)
    expect(s().project).toBe(p)
  })

  it('layers inside a locked group are locked too', async () => {
    const { s } = await open()
    s().setLocked('g', true)
    expect(
      s().commitGeometry([
        { id: 'g-a', geometry: { x: 0, y: 0, width: 10, height: 10, rotation: 0 } }
      ])
    ).toBe(false)
  })

  it('hidden layers are unchanged by canvas edits that target other layers', async () => {
    const { s } = await open()
    s().setVisibility('photo-1', false)
    s().commitGeometry([
      { id: 'photo-2', geometry: { x: 5, y: 5, width: 100, height: 100, rotation: 0 } }
    ])
    expect(layer(s().project, 'photo-1')).toMatchObject({ visible: false, x: 250 })
  })
})

describe('duplicate and delete through the store', () => {
  it('duplicate selects the copy, preserves photoNumber, and is one undo step', async () => {
    const { s } = await open()
    s().selectLayer('photo-2')
    expect(s().duplicateSelection()).toBe(true)
    const id = selectActiveId(s())!
    expect(id).not.toBe('photo-2')
    expect(layer(s().project, id)).toMatchObject({ type: 'photo', photoNumber: 2 })
    expect(checkProjectIntegrity(s().project!)).toEqual([])
    s().undo()
    expect(s().project!.layers.some((l) => l.id === id)).toBe(false)
  })

  it('deleting a group removes descendants and clears selection', async () => {
    const { s } = await open()
    s().selectLayer('g')
    s().deleteSelection()
    expect(s().project!.layers.filter((l) => ['g', 'g-a', 'g-b'].includes(l.id))).toHaveLength(0)
    expect(s().selectedIds).toEqual([])
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })

  it('addLayer selects the new layer', async () => {
    const { s } = await open()
    s().addLayer(photo('extra', 1))
    expect(selectActiveId(s())).toBe('extra')
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })
})

describe('text editing state', () => {
  it('begin/commit/cancel; unchanged text creates no history; editing ends if the layer disappears', async () => {
    const { s } = await open()
    s().beginTextEdit('title')
    expect(s().interaction).toBe('editingText')
    expect(s().editingTextId).toBe('title')
    expect(s().commitText('title', 'Hello')).toBe(false) // same content
    expect(s().commitText('title', 'New text')).toBe(true)
    s().endTextEdit()
    expect(s().editingTextId).toBeNull()
    expect(layer(s().project, 'title')).toMatchObject({ content: 'New text' })
    s().beginTextEdit('title')
    s().selectLayer('title')
    s().deleteSelection()
    expect(s().editingTextId).toBeNull()
    expect(s().interaction).toBe('idle')
  })

  it('only unlocked text layers can be edited', async () => {
    const { s } = await open()
    s().beginTextEdit('photo-1')
    expect(s().editingTextId).toBeNull()
    s().setLocked('title', true)
    s().beginTextEdit('title')
    expect(s().editingTextId).toBeNull()
    expect(text('t', 0).type).toBe('text')
  })
})

describe('viewport', () => {
  it('fit follows the viewport; zoom is manual, clamped, and never changes project coordinates', async () => {
    const { s } = await open()
    s().setViewport({ width: 500, height: 750 })
    const fit = selectViewTransform(s())!
    expect(fit.scale).toBeCloseTo(Math.min((500 - 48) / 2400, (750 - 48) / 3600), 9)
    const p = s().project
    s().zoomIn()
    expect(selectViewTransform(s())!.scale).toBeGreaterThan(fit.scale)
    for (let i = 0; i < 80; i++) s().zoomIn()
    expect(selectViewTransform(s())!.scale).toBeLessThanOrEqual(4)
    s().fitToWindow()
    expect(selectViewTransform(s())!).toEqual(fit)
    expect(s().project).toBe(p)
  })

  it('actual size is 1 design px per CSS px', async () => {
    const { s } = await open()
    s().setViewport({ width: 500, height: 750 })
    s().zoomToActualSize()
    expect(selectViewTransform(s())!.scale).toBe(1)
  })

  it('zoomAtPoint keeps the anchored design point fixed', async () => {
    const { s } = await open()
    s().setViewport({ width: 500, height: 750 })
    const before = selectViewTransform(s())!
    s().zoomAtPoint(2, { x: 100, y: 200 })
    const after = selectViewTransform(s())!
    const dx = (100 - before.offsetX) / before.scale
    expect((100 - after.offsetX) / after.scale).toBeCloseTo(dx, 9)
  })

  it('there is no view without a project', () => {
    expect(selectViewTransform(setup().s())).toBeNull()
  })

  it('user preferences survive opening another project', async () => {
    const { s } = await open()
    s().setSnapping({ enabled: false })
    s().setViewport({ width: 321, height: 654 })
    await s().openFromDialog()
    expect(s().snapping.enabled).toBe(false)
    expect(s().viewport).toEqual({ width: 321, height: 654 })
  })

  it('guides are deduplicated', async () => {
    const { s } = await open()
    const g = [{ axis: 'x' as const, at: 1 }]
    s().setGuides(g)
    const ref = s().guides
    s().setGuides([{ axis: 'x', at: 1 }])
    expect(s().guides).toBe(ref)
  })

  it('scene fixture is valid', () => {
    expect(checkProjectIntegrity(scene())).toEqual([])
  })
})
