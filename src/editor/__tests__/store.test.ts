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
import { fakeTimers } from './fakeTimers'

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

const layerOf = (p: { layers: Layer[] } | null, id: string): Layer =>
  p!.layers.find((l) => l.id === id) as Layer
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

describe('autosave to the recovery copy (debounced, never clears Modified)', () => {
  function withTimers() {
    const ports = fakePorts()
    const timers = fakeTimers()
    const store = createEditorStore({
      ports,
      autosave: { debounceMs: 2000, maxWaitMs: 10000, timers },
      createId: (() => {
        let n = 0
        return () => `n-${++n}`
      })()
    })
    return { ports, timers, store, s: () => store.getState() }
  }

  it('a content change schedules a recovery write after the debounce, with the LATEST project', async () => {
    const { ports, timers, s } = withTimers()
    await s().createSample()
    s().commitGeometry([
      { id: 'photo-1', geometry: { x: 1, y: 1, width: 400, height: 400, rotation: 0 } }
    ])
    s().setLocked('photo-2', true)
    expect(ports.workingCopies).toHaveLength(0)
    await timers.advance(2000)
    expect(ports.workingCopies).toHaveLength(1)
    expect(ports.workingCopies[0]).toBe(s().project)
    expect(s().autosave.state).toBe('saved')
    expect(ports.calls.some((c) => c.name === 'save' || c.name === 'saveAs')).toBe(false)
  })

  it('autosave never marks the project clean and never touches undo history', async () => {
    const { timers, s } = withTimers()
    await s().openFromDialog()
    s().editLayers(['photo-1'], { x: 9 })
    const past = s().history.past.length
    await timers.advance(5000)
    expect(s().autosave.state).toBe('saved')
    expect(selectIsDirty(s())).toBe(true)
    expect(s().history.past).toHaveLength(past)
    expect(s().undo()).toBe(true)
    expect(selectIsDirty(s())).toBe(false)
  })

  it('viewport, selection, guides, snapping and UI-state changes do not schedule writes', async () => {
    const { ports, timers, s } = withTimers()
    await s().openFromDialog()
    s().selectLayer('photo-1')
    s().zoomIn()
    s().panBy(5, 5)
    s().setGuides([{ axis: 'x', at: 1 }])
    s().setSnapping({ enabled: false })
    s().toggleCollapsed('g')
    s().setLayerFilter('x')
    await timers.advance(60_000)
    expect(ports.workingCopies).toHaveLength(0)
    expect(s().autosave.state).toBe('idle')
  })

  it('repeated edits within the debounce window produce a single write', async () => {
    const { ports, timers, s } = withTimers()
    await s().openFromDialog()
    for (let i = 0; i < 6; i++) {
      s().editLayers(['photo-1'], { x: i + 1 })
      await timers.advance(500)
    }
    await timers.advance(2000)
    expect(ports.workingCopies).toHaveLength(1)
    expect(ports.workingCopies[0]?.layers.find((l) => l.id === 'photo-1')).toMatchObject({ x: 6 })
  })

  it('undo and redo also refresh the recovery copy', async () => {
    const { ports, timers, s } = withTimers()
    await s().openFromDialog()
    s().editLayers(['photo-1'], { x: 5 })
    await timers.advance(2000)
    s().undo()
    await timers.advance(2000)
    expect(ports.workingCopies).toHaveLength(2)
    expect(ports.workingCopies[1]).toBe(s().project)
  })

  it('a failing recovery write never crashes the editor, keeps the work, and reports a persistent issue only after repeated failures', async () => {
    const { ports, timers, s } = withTimers()
    await s().openFromDialog()
    ports.updateWorkingCopy = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'write-failed' as const, message: 'disk full' }
      })
    s().editLayers(['photo-1'], { x: 42 })
    await timers.advance(2000)
    expect(s().autosave).toMatchObject({ state: 'error', failures: 1 })
    expect(s().autosaveIssue).toBeNull() // one failure is not announced
    expect(layerOf(s().project, 'photo-1')).toMatchObject({ x: 42 }) // in-memory work retained
    await timers.advance(5000)
    expect(s().autosave.failures).toBeGreaterThanOrEqual(2)
    expect(s().autosaveIssue).toMatch(/Recovery copies could not be saved/)
    expect(selectIsDirty(s())).toBe(true)
    // recovery: the next success clears the issue
    ports.updateWorkingCopy = () =>
      Promise.resolve({ status: 'ok' as const, value: { dirty: true } })
    await timers.advance(60_000)
    expect(s().autosave.state).toBe('saved')
    expect(s().autosaveIssue).toBeNull()
  })

  it('opening or closing a project cancels pending recovery writes for the old one', async () => {
    const { ports, timers, s } = withTimers()
    await s().openFromDialog()
    s().editLayers(['photo-1'], { x: 5 })
    await s().closeProject()
    await timers.advance(60_000)
    expect(ports.workingCopies).toHaveLength(0)
  })

  it('flushRecovery writes pending work immediately', async () => {
    const { ports, s } = withTimers()
    await s().openFromDialog()
    s().editLayers(['photo-1'], { x: 5 })
    await s().flushRecovery()
    expect(ports.workingCopies).toHaveLength(1)
  })
})

describe('close guard and main-process document requests', () => {
  it('a clean project closes without asking main', async () => {
    const { s, ports } = setup()
    await s().openFromDialog()
    expect(await s().guardClose('close-project')).toBe(true)
    expect(ports.calls.some((c) => c.name === 'requestClose')).toBe(false)
  })

  it('a modified project asks main and obeys its decision', async () => {
    const { s, ports } = setup()
    await s().openFromDialog()
    s().editLayers(['photo-1'], { x: 5 })
    expect(await s().guardClose('replace')).toBe(true)
    ports.requestClose = () => Promise.resolve({ status: 'ok' as const, value: { proceed: false } })
    expect(await s().guardClose('replace')).toBe(false)
    ports.requestClose = () => Promise.reject(new Error('ipc down'))
    expect(await s().guardClose('quit')).toBe(false) // when in doubt, do not close
  })

  it('answers the document state request used by quit protection', async () => {
    const { s } = setup()
    expect(await s().respondToDocumentRequest('state')).toMatchObject({
      kind: 'state',
      state: { hasProject: false, dirty: false }
    })
    await s().createSample()
    expect(await s().respondToDocumentRequest('state')).toMatchObject({
      state: { hasProject: true, dirty: true, neverSaved: true, name: 'Test' }
    })
    await s().saveAs()
    expect(await s().respondToDocumentRequest('state')).toMatchObject({
      state: { dirty: false, neverSaved: false }
    })
  })

  it('save-before-close reports saved / cancelled / failed', async () => {
    const { s, ports } = setup()
    await s().createSample()
    expect(await s().respondToDocumentRequest('save')).toEqual({ kind: 'save', status: 'saved' })
    s().editLayers(['photo-1'], { x: 5 })
    ports.save = () => Promise.resolve({ status: 'cancelled' as const })
    expect(await s().respondToDocumentRequest('save')).toEqual({
      kind: 'save',
      status: 'cancelled'
    })
    ports.save = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'write-failed' as const, message: 'disk full' }
      })
    expect(await s().respondToDocumentRequest('save')).toMatchObject({
      kind: 'save',
      status: 'failed',
      message: 'disk full'
    })
    expect(selectIsDirty(s())).toBe(true) // a failed save leaves the project Modified
  })
})

describe('recovery actions', () => {
  const candidate = {
    sessionId: 'sess-r',
    projectName: 'Lost work',
    originalFileName: null,
    neverSaved: true,
    lastWorkingSaveAt: '2026-01-01T00:00:00.000Z',
    lastPortableSaveAt: null,
    conflict: 'none' as const,
    missingAssets: 0
  }

  it('loads candidates and recovering adopts the project as Modified with fresh undo history', async () => {
    const { s, ports } = setup()
    ports.recoveryList = () =>
      Promise.resolve({ status: 'ok' as const, value: { candidates: [candidate], quarantined: 2 } })
    await s().loadRecovery()
    expect(s().recovery).toMatchObject({ loaded: true, quarantined: 2 })
    expect(s().recovery.candidates).toHaveLength(1)
    expect((await s().recoverCandidate('sess-r')).status).toBe('ok')
    expect(selectIsDirty(s())).toBe(true)
    expect(selectCanUndo(s())).toBe(false)
    expect(s().recovery.candidates).toHaveLength(0)
  })

  it('recovery warnings (conflicts) are surfaced as a message', async () => {
    const { s, ports } = setup()
    ports.recover = (id) =>
      Promise.resolve({
        status: 'ok' as const,
        value: {
          sessionId: id,
          project: scene(),
          fileName: null,
          dirty: true,
          warnings: ['The saved file changed after this recovery copy was made.']
        }
      })
    await s().recoverCandidate('x')
    expect(s().lastMessage).toMatch(/changed/)
  })

  it('a failed recovery leaves the candidate listed and the editor unchanged', async () => {
    const { s, ports } = setup()
    ports.recoveryList = () =>
      Promise.resolve({ status: 'ok' as const, value: { candidates: [candidate], quarantined: 0 } })
    await s().loadRecovery()
    ports.recover = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'recovery-asset-missing' as const, message: 'Some image files are missing.' }
      })
    expect((await s().recoverCandidate('sess-r')).status).toBe('error')
    expect(s().project).toBeNull()
    expect(s().recovery.candidates).toHaveLength(1)
  })

  it('discard removes the candidate; failure keeps it', async () => {
    const { s, ports } = setup()
    ports.recoveryList = () =>
      Promise.resolve({ status: 'ok' as const, value: { candidates: [candidate], quarantined: 0 } })
    await s().loadRecovery()
    ports.discardRecovery = () =>
      Promise.resolve({
        status: 'error' as const,
        error: { code: 'recovery-discard-failed' as const, message: 'busy' }
      })
    expect((await s().discardCandidate('sess-r')).status).toBe('error')
    expect(s().recovery.candidates).toHaveLength(1)
    ports.discardRecovery = () => Promise.resolve({ status: 'ok' as const, value: null })
    expect((await s().discardCandidate('sess-r')).status).toBe('ok')
    expect(s().recovery.candidates).toHaveLength(0)
  })

  it('"Decide later" hides the list for this run without discarding anything', async () => {
    const { s, ports } = setup()
    ports.recoveryList = () =>
      Promise.resolve({ status: 'ok' as const, value: { candidates: [candidate], quarantined: 0 } })
    await s().loadRecovery()
    s().dismissRecovery()
    expect(s().recovery.dismissed).toBe(true)
    expect(s().recovery.candidates).toHaveLength(1)
  })

  it('recovery state survives opening another project', async () => {
    const { s, ports } = setup()
    ports.recoveryList = () =>
      Promise.resolve({ status: 'ok' as const, value: { candidates: [candidate], quarantined: 0 } })
    await s().loadRecovery()
    await s().openFromDialog()
    expect(s().recovery.candidates).toHaveLength(1)
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

describe('Phase 4 store actions', () => {
  it('multi-selection: click, toggle, range, and deselect', async () => {
    const { s } = await open()
    s().selectLayer('photo-1')
    s().toggleSelection('photo-2')
    expect(s().selectedIds).toEqual(['photo-1', 'photo-2'])
    s().toggleSelection('photo-1')
    expect(s().selectedIds).toEqual(['photo-2'])
    s().selectLayer('photo-1')
    s().selectRange(['photo-3', 'photo-2', 'photo-1', 'bg-bar'], 'photo-3')
    expect(s().selectedIds).toEqual(['photo-3', 'photo-2', 'photo-1'])
    s().clearSelection()
    expect(s().selectedIds).toEqual([])
    expect(selectCanUndo(s())).toBe(false) // selection never creates history
  })

  it('collapse, filter and selection are editor UI state: never dirty, never history', async () => {
    const { s } = setup()
    await s().openFromDialog() // a saved (clean) project
    const p = s().project
    s().toggleCollapsed('g')
    s().setLayerFilter('photo')
    s().selectLayers(['photo-1', 'photo-2'])
    expect(s().collapsedGroups).toEqual(['g'])
    s().toggleCollapsed('g')
    expect(s().collapsedGroups).toEqual([])
    expect(s().project).toBe(p)
    expect(selectIsDirty(s())).toBe(false)
    expect(selectCanUndo(s())).toBe(false)
  })

  it('collapsed state and filter reset when another project is opened', async () => {
    const { s } = await open()
    s().toggleCollapsed('g')
    s().setLayerFilter('x')
    await s().openFromDialog()
    expect(s().collapsedGroups).toEqual([])
    expect(s().layerFilter).toBe('')
  })

  it('rename is ONE history entry, allows duplicate names, rejects empty names with a message', async () => {
    const { s } = await open()
    expect(s().renameLayer('photo-1', 'Hero')).toBe(true)
    expect(s().history.past).toHaveLength(1)
    expect(s().renameLayer('photo-2', 'Hero')).toBe(true)
    expect(s().project!.layers.filter((l) => l.name === 'Hero')).toHaveLength(2)
    expect(s().renameLayer('photo-3', '  ')).toBe(false)
    expect(s().lastMessage).toMatch(/empty/)
    expect(s().renameLayer('photo-1', 'Hero')).toBe(false) // unchanged: no history entry
    expect(s().history.past).toHaveLength(2)
    s().undo()
    expect(layer(s().project, 'photo-2').name).toBe('Photo 2')
  })

  it('editing a property is one entry; locked layers accept only name/locked/visible', async () => {
    const { s } = await open()
    expect(s().editLayers(['photo-1'], { x: -120, y: 33.5, opacity: 0.4 })).toBe(true)
    expect(layer(s().project, 'photo-1')).toMatchObject({ x: -120, y: 33.5, opacity: 0.4 })
    expect(s().history.past).toHaveLength(1)
    s().setLocked('photo-2', true)
    const p = s().project
    expect(s().editLayers(['photo-2'], { x: 5 })).toBe(false)
    expect(s().project).toBe(p)
    expect(s().editLayers(['photo-2'], { name: 'Renamed locked' })).toBe(true)
    expect(s().editLayers(['photo-2'], { locked: false })).toBe(true)
    expect(layer(s().project, 'photo-2')).toMatchObject({ locked: false, name: 'Renamed locked' })
  })

  it('bulk edit updates every selected layer in one undo step', async () => {
    const { s } = await open()
    const before = s().history.past.length
    s().editLayers(['photo-1', 'photo-2', 'photo-3'], { opacity: 0.25 })
    expect(s().history.past.length).toBe(before + 1)
    s().undo()
    expect(layer(s().project, 'photo-2').opacity).toBe(1)
  })

  it('adding a layer selects it, is one undo step, and a new photo takes the next slot', async () => {
    const { s } = await open()
    expect(s().addNewLayer('photo')).toBe(true)
    const id = s().selectedIds[0]!
    expect(layer(s().project, id)).toMatchObject({ type: 'photo', photoNumber: 4 })
    expect(s().history.past).toHaveLength(1)
    expect(selectIsDirty(s())).toBe(true)
    for (const k of ['text', 'rectangle', 'ellipse', 'line'] as const)
      expect(s().addNewLayer(k)).toBe(true)
    expect(checkProjectIntegrity(s().project!)).toEqual([])
    s().undo()
    expect(
      s().project!.layers.filter((l) => l.type === 'shape' && l.shape === 'line')
    ).toHaveLength(0)
  })

  it('duplicate preserves the photoNumber while add increments it', async () => {
    const { s } = await open()
    s().selectLayer('photo-2')
    s().duplicateSelection()
    const dup = layer(s().project, s().selectedIds[0]!)
    expect(dup).toMatchObject({ type: 'photo', photoNumber: 2 })
    s().addNewLayer('photo')
    const added = layer(s().project, s().selectedIds[0]!)
    expect(added).toMatchObject({ photoNumber: 4 })
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })

  it('bulk delete/duplicate use topmost layers only (no double handling of group + child)', async () => {
    const { s } = await open()
    s().selectLayers(['g', 'g-a', 'photo-1'])
    s().duplicateSelection()
    expect(s().selectedIds).toHaveLength(2)
    expect(checkProjectIntegrity(s().project!)).toEqual([])
    s().undo()
    s().selectLayers(['g', 'g-a', 'photo-1'])
    expect(s().deleteSelection()).toBe(true)
    expect(s().project!.layers.some((l) => ['g', 'g-a', 'g-b', 'photo-1'].includes(l.id))).toBe(
      false
    )
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })

  it('stacking commands work on selections and refuse mixed parents with a message', async () => {
    const { s } = await open()
    s().selectLayers(['photo-1', 'photo-2'])
    expect(s().stackSelection('front')).toBe(true)
    expect(s().stackSelection('front')).toBe(false) // already there: no history entry
    s().selectLayers(['photo-1', 'g-a'])
    expect(s().stackSelection('front')).toBe(false)
    expect(s().lastMessage).toMatch(/same group/)
  })

  it('panel drag reorder commits one entry and cannot cross groups', async () => {
    const { s } = await open()
    expect(s().moveLayerRelative('photo-1', 'photo-3', 'above')).toBe(true)
    expect(s().history.past).toHaveLength(1)
    expect(s().moveLayerRelative('g-a', 'photo-1', 'above')).toBe(false)
    expect(s().lastMessage).toMatch(/same group/)
    expect(checkProjectIntegrity(s().project!)).toEqual([])
  })

  it('group / ungroup are single undoable operations and keep selection coherent', async () => {
    const { s } = await open()
    s().selectLayers(['photo-1', 'photo-2'])
    expect(s().groupSelection()).toBe(true)
    const gid = s().selectedIds[0]!
    expect(layer(s().project, gid).type).toBe('group')
    expect(s().history.past).toHaveLength(1)
    expect(s().ungroupSelection()).toBe(true)
    expect(s().selectedIds.sort()).toEqual(['photo-1', 'photo-2'])
    expect(checkProjectIntegrity(s().project!)).toEqual([])
    s().undo()
    expect(layer(s().project, gid).type).toBe('group')
    s().undo()
    expect(s().project!.layers.some((l) => l.id === gid)).toBe(false)
  })

  it('locking and hiding through the panel are undoable direct-state changes', async () => {
    const { s } = await open()
    s().setLocked('g', true)
    s().setVisibility('g', false)
    expect(layer(s().project, 'g-a')).toMatchObject({ locked: false, visible: true }) // direct flags of the child are untouched
    s().undo()
    s().undo()
    expect(layer(s().project, 'g')).toMatchObject({ locked: false, visible: true })
  })

  it('property edits survive save and reopen semantics at the store level (saved project equals current)', async () => {
    const { s } = await open()
    s().editLayers(['photo-1'], { x: 1, y: 2 })
    await s().save()
    expect(selectIsDirty(s())).toBe(false)
    s().editLayers(['photo-1'], { x: 3 })
    expect(selectIsDirty(s())).toBe(true)
  })
})

describe('Phase 4: repeated identical edits', () => {
  it('committing the same value twice (Enter then blur) creates exactly one history entry', async () => {
    const { s } = await open()
    s().editLayers(['photo-1'], { x: 77 })
    s().editLayers(['photo-1'], { x: 77 })
    expect(s().history.past).toHaveLength(1)
  })
})
