import { createStore, type StoreApi } from 'zustand/vanilla'
import { getPixelSize, nowIso, type Layer, type TemplateProject } from '@domain'
import {
  centeredView,
  panBy as panView,
  resolveView,
  toManual,
  zoomAt,
  zoomStep,
  type Size,
  type ViewState,
  type ViewTransform
} from '@canvas/viewport/viewport'
import type { Guide } from '@canvas/snapping/snap'
import { emptyHistory, pushHistory, redoHistory, undoHistory, type History } from './history'
import {
  addLayer as addLayerMutation,
  commitGeometry,
  duplicateLayer,
  moveLayerBy,
  removeLayer,
  reorderLayer,
  reorderLayers,
  groupLayers,
  ungroupLayer,
  moveLayerRelative,
  renameLayer as renameLayerMutation,
  setLocked as setLockedMutation,
  setVisibility as setVisibilityMutation,
  updateLayer,
  type GeometryChange,
  type MutationContext
} from './mutations'
import type { EditorPorts } from './ports'
import type { OpenProjectInfo } from '@shared/ipc'
import type { IpcResult } from '@shared/persistence'
import { isEditable, topmostIds } from '@domain'
import { createNewLayer, type NewLayerKind } from './newLayers'
import { rangeIds, toggleId } from './selection'

export type Interaction = 'idle' | 'transforming' | 'editingText'
export type PhotoDisplay = 'placeholder' | 'preview'

export interface EditorState {
  session: { sessionId: string; fileName: string | null } | null
  project: TemplateProject | null
  /** Reference to the project as last saved/opened. dirty = project !== savedProject. */
  savedProject: TemplateProject | null
  /** Selected layer ids, in selection order (multi-selection). */
  selectedIds: string[]
  /** Anchor for Shift-range selection in the Layers Panel. */
  anchorId: string | null
  /** Collapsed group ids: editor UI state only, never in the project, history or dirty state. */
  collapsedGroups: readonly string[]
  /** Layers Panel name filter (editor UI state). */
  layerFilter: string
  view: ViewState
  viewport: Size
  interaction: Interaction
  editingTextId: string | null
  snapping: { enabled: boolean; tolerancePx: number }
  guidesVisible: boolean
  /** Active snap guide lines (editor-only; never rendered into output or history). */
  guides: Guide[]
  photoDisplay: PhotoDisplay
  history: History<TemplateProject>
  lastMessage: string | null
}

export interface CommitOptions {
  coalesceKey?: string
}

export type OpResult =
  { status: 'ok' } | { status: 'cancelled' } | { status: 'error'; message: string }

export interface EditorActions {
  // ---- project lifecycle (via ports)
  adopt(info: OpenProjectInfo): void
  createProject(req: {
    name: string
    preset: Parameters<EditorPorts['create']>[0]['preset']
  }): Promise<OpResult>
  createSample(): Promise<OpResult>
  openFromDialog(): Promise<OpResult>
  openRecent(path: string): Promise<OpResult>
  save(): Promise<OpResult>
  saveAs(): Promise<OpResult>
  closeProject(): Promise<OpResult>
  // ---- content changes (each is one history entry)
  commit(
    mutate: (p: TemplateProject, ctx: MutationContext) => TemplateProject,
    options?: CommitOptions
  ): boolean
  commitGeometry(changes: readonly GeometryChange[], options?: CommitOptions): boolean
  addLayer(layer: Layer): void
  updateLayer(id: string, patch: Parameters<typeof updateLayer>[2]): boolean
  setVisibility(id: string, visible: boolean): boolean
  setLocked(id: string, locked: boolean): boolean
  reorder(id: string, direction: 'forward' | 'backward' | 'front' | 'back'): boolean
  nudgeSelection(dx: number, dy: number): boolean
  deleteSelection(): boolean
  duplicateSelection(): boolean
  commitText(id: string, content: string): boolean
  undo(): boolean
  redo(): boolean
  clearHistory(): void
  addNewLayer(kind: NewLayerKind): boolean
  renameLayer(id: string, name: string): boolean
  /** Edits properties of layers; locked layers only accept `name`, `locked` and `visible`. */
  editLayers(
    ids: readonly string[],
    patch: Parameters<typeof updateLayer>[2],
    options?: CommitOptions
  ): boolean
  stackSelection(direction: 'forward' | 'backward' | 'front' | 'back'): boolean
  moveLayerRelative(id: string, targetId: string, placement: 'above' | 'below'): boolean
  groupSelection(): boolean
  ungroupSelection(): boolean
  // ---- selection / interaction (never in history)
  selectLayer(id: string | null): void
  selectLayers(ids: readonly string[]): void
  toggleSelection(id: string): void
  selectRange(orderedIds: readonly string[], targetId: string): void
  toggleCollapsed(id: string): void
  setLayerFilter(filter: string): void
  clearSelection(): void
  beginTextEdit(id: string): void
  endTextEdit(): void
  setInteraction(i: Interaction): void
  // ---- view (never in history, never dirty)
  setViewport(size: Size): void
  fitToWindow(): void
  zoomIn(): void
  zoomOut(): void
  zoomToActualSize(): void
  zoomAtPoint(factor: number, anchor: { x: number; y: number }): void
  panBy(dx: number, dy: number): void
  setSnapping(patch: Partial<EditorState['snapping']>): void
  setGuides(guides: Guide[]): void
  setGuidesVisible(visible: boolean): void
  setPhotoDisplay(mode: PhotoDisplay): void
  setMessage(message: string | null): void
}

export type EditorStore = StoreApi<EditorState & EditorActions>

export interface EditorStoreOptions {
  ports: EditorPorts
  now?: () => string
  /** Clock for history coalescing (injectable for tests). */
  clock?: () => number
  createId?: () => string
}

const initialState = (): EditorState => ({
  session: null,
  project: null,
  savedProject: null,
  selectedIds: [],
  anchorId: null,
  collapsedGroups: [],
  layerFilter: '',
  view: { mode: 'fit' },
  viewport: { width: 800, height: 600 },
  interaction: 'idle',
  editingTextId: null,
  snapping: { enabled: true, tolerancePx: 10 },
  guidesVisible: true,
  guides: [],
  photoDisplay: 'placeholder',
  history: emptyHistory<TemplateProject>(),
  lastMessage: null
})

export const selectIsDirty = (s: EditorState): boolean =>
  s.project !== null && s.project !== s.savedProject
export const selectCanUndo = (s: EditorState): boolean => s.history.past.length > 0
export const selectCanRedo = (s: EditorState): boolean => s.history.future.length > 0
export const selectActiveId = (s: EditorState): string | null =>
  s.selectedIds[s.selectedIds.length - 1] ?? null
export function selectDesignSize(s: EditorState): Size | null {
  return s.project ? getPixelSize(s.project.canvas.print) : null
}
export function selectViewTransform(s: EditorState): ViewTransform | null {
  const design = selectDesignSize(s)
  return design ? resolveView(s.view, design, s.viewport) : null
}

const sameGuides = (a: Guide[], b: Guide[]): boolean =>
  a.length === b.length && a.every((g, i) => g.axis === b[i]?.axis && g.at === b[i]?.at)

/**
 * The editor store. Project data lives here exactly once (no second copy of layer geometry);
 * Konva only renders it and reports finished interactions back through `commitGeometry`.
 * History records project snapshots; selection, view, guides and interaction are outside history.
 */
export function createEditorStore(options: EditorStoreOptions): EditorStore {
  const { ports } = options
  const now = options.now ?? nowIso
  const clock = options.clock ?? Date.now

  // Working-copy write-through: latest wins, one request in flight (no timers).
  let inFlight = false
  let pending = false
  const flushWorkingCopy = async (get: () => EditorState): Promise<void> => {
    if (inFlight) {
      pending = true
      return
    }
    inFlight = true
    try {
      do {
        pending = false
        const { session, project } = get()
        if (!session || !project) break
        await ports.updateWorkingCopy(session.sessionId, project).catch(() => undefined)
      } while (pending)
    } finally {
      inFlight = false
    }
  }

  return createStore<EditorState & EditorActions>()((set, get) => {
    const ctx = (): MutationContext => ({
      now: now(),
      ...(options.createId ? { createId: options.createId } : {})
    })

    const prune = (project: TemplateProject, selectedIds: string[]): string[] =>
      selectedIds.filter((id) => project.layers.some((l) => l.id === id))

    const apply = (next: TemplateProject, previous: TemplateProject, o: CommitOptions): void => {
      const s = get()
      const history = pushHistory(s.history, previous, { coalesceKey: o.coalesceKey, now: clock() })
      const editingGone =
        s.editingTextId !== null && !next.layers.some((l) => l.id === s.editingTextId)
      set({
        project: next,
        history,
        selectedIds: prune(next, s.selectedIds),
        ...(editingGone ? { editingTextId: null, interaction: 'idle' as Interaction } : {})
      })
      void flushWorkingCopy(get)
    }

    const editableSelected = (): Layer[] => {
      const { project, selectedIds } = get()
      if (!project) return []
      // Topmost only: a group and its own child are never processed twice by a bulk operation.
      return topmostIds(project.layers, selectedIds)
        .map((id) => project.layers.find((l) => l.id === id))
        .filter((l): l is Layer => l !== undefined && isEditable(project.layers, l))
    }

    const adoptInfo = (info: OpenProjectInfo): void =>
      set({
        ...initialStateKeepingUi(get()),
        session: { sessionId: info.sessionId, fileName: info.fileName },
        project: info.project,
        savedProject: info.dirty ? null : info.project,
        history: emptyHistory<TemplateProject>()
      })

    const run = async (op: () => Promise<IpcResult<OpenProjectInfo>>): Promise<OpResult> => {
      try {
        const r = await op()
        if (r.status === 'cancelled') return { status: 'cancelled' }
        if (r.status === 'error') {
          set({ lastMessage: r.error.message })
          return { status: 'error', message: r.error.message }
        }
        const previous = get().session
        adoptInfo(r.value)
        // Replacing the open project: release the previous session's working directory.
        if (previous && previous.sessionId !== r.value.sessionId)
          void ports.close(previous.sessionId).catch(() => undefined)
        return { status: 'ok' }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        set({ lastMessage: message })
        return { status: 'error', message }
      }
    }

    const saveWith = async (kind: 'save' | 'saveAs'): Promise<OpResult> => {
      const { session, project } = get()
      if (!session || !project) return { status: 'error', message: 'No project is open.' }
      try {
        const r = await ports[kind](session.sessionId, project)
        if (r.status === 'cancelled') return { status: 'cancelled' }
        if (r.status === 'error') {
          set({ lastMessage: r.error.message })
          return { status: 'error', message: r.error.message }
        }
        // Clean only relative to what was actually written; edits made while saving stay dirty.
        set({
          savedProject: project,
          session: { sessionId: session.sessionId, fileName: r.value.fileName },
          lastMessage: null
        })
        return { status: 'ok' }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        set({ lastMessage: message })
        return { status: 'error', message }
      }
    }

    return {
      ...initialState(),

      adopt: adoptInfo,
      createProject: (req) => run(() => ports.create(req)),
      createSample: () => run(() => ports.newSample()),
      openFromDialog: () => run(() => ports.open()),
      openRecent: (path) => run(() => ports.openRecent(path)),
      save: () => saveWith('save'),
      saveAs: () => saveWith('saveAs'),
      async closeProject() {
        const { session } = get()
        if (!session) return { status: 'ok' }
        const r = await ports.close(session.sessionId).catch(() => null)
        if (r && r.status === 'error') {
          set({ lastMessage: r.error.message })
          return { status: 'error', message: r.error.message }
        }
        set({ ...initialState(), lastMessage: null })
        return { status: 'ok' }
      },

      commit(mutate, o = {}) {
        const { project } = get()
        if (!project) return false
        const next = mutate(project, ctx())
        if (next === project) return false
        apply(next, project, o)
        return true
      },
      commitGeometry(changes, o = {}) {
        const { project } = get()
        if (!project) return false
        const allowed = changes.filter((c) => {
          const l = project.layers.find((x) => x.id === c.id)
          return l !== undefined && isEditable(project.layers, l)
        })
        if (allowed.length === 0) return false
        return get().commit((p, c) => commitGeometry(p, allowed, c), o)
      },
      addLayer(layer) {
        get().commit((p, c) => addLayerMutation(p, layer, c))
        set({ selectedIds: [layer.id] })
      },
      updateLayer: (id, patch) => get().commit((p, c) => updateLayer(p, id, patch, c)),
      setVisibility: (id, visible) =>
        get().commit((p, c) => setVisibilityMutation(p, id, visible, c)),
      setLocked: (id, locked) => get().commit((p, c) => setLockedMutation(p, id, locked, c)),
      reorder: (id, direction) => get().commit((p, c) => reorderLayer(p, id, direction, c)),
      nudgeSelection(dx, dy) {
        const layers = editableSelected()
        if (layers.length === 0) return false
        const key = `nudge:${layers.map((l) => l.id).join(',')}`
        return get().commit(
          (p, c) => layers.reduce((acc, l) => moveLayerBy(acc, l.id, dx, dy, c), p),
          { coalesceKey: key }
        )
      },
      deleteSelection() {
        const layers = editableSelected()
        if (layers.length === 0) return false
        const ok = get().commit((p, c) =>
          layers.reduce(
            (acc, l) => (acc.layers.some((x) => x.id === l.id) ? removeLayer(acc, l.id, c) : acc),
            p
          )
        )
        if (ok) set({ selectedIds: [] })
        return ok
      },
      duplicateSelection() {
        const layers = editableSelected()
        if (layers.length === 0) return false
        const roots: string[] = []
        const ok = get().commit((p, c) =>
          layers.reduce((acc, l) => {
            const r = duplicateLayer(acc, l.id, c)
            roots.push(r.rootId)
            return r.project
          }, p)
        )
        if (ok) set({ selectedIds: roots, anchorId: roots[roots.length - 1] ?? null })
        return ok
      },
      addNewLayer(kind) {
        const { project } = get()
        if (!project) return false
        const layer = createNewLayer(project, kind, options.createId)
        const ok = get().commit((p, c) => addLayerMutation(p, layer, c))
        if (ok) set({ selectedIds: [layer.id], anchorId: layer.id })
        return ok
      },
      renameLayer(id, name) {
        if (name.trim() === '') {
          set({ lastMessage: 'A layer name cannot be empty.' })
          return false
        }
        return get().commit((p, c) => renameLayerMutation(p, id, name, c))
      },
      editLayers(ids, patch, o = {}) {
        const { project } = get()
        if (!project) return false
        const alwaysAllowed = new Set(['name', 'locked', 'visible'])
        const onlyLabels = Object.keys(patch).every((k) => alwaysAllowed.has(k))
        const targets = ids.filter((id) => {
          const l = project.layers.find((x) => x.id === id)
          return l !== undefined && (onlyLabels || isEditable(project.layers, l))
        })
        if (targets.length === 0) return false
        return get().commit(
          (p, c) => targets.reduce((acc, id) => updateLayer(acc, id, patch, c), p),
          o
        )
      },
      stackSelection(direction) {
        const layers = editableSelected()
        if (layers.length === 0) return false
        try {
          return get().commit((p, c) =>
            reorderLayers(
              p,
              layers.map((l) => l.id),
              direction,
              c
            )
          )
        } catch (e) {
          set({ lastMessage: e instanceof Error ? e.message : String(e) })
          return false
        }
      },
      moveLayerRelative(id, targetId, placement) {
        const { project } = get()
        const layer = project?.layers.find((l) => l.id === id)
        if (!project || !layer || !isEditable(project.layers, layer)) return false
        try {
          return get().commit((p, c) => moveLayerRelative(p, id, targetId, placement, c))
        } catch (e) {
          set({ lastMessage: e instanceof Error ? e.message : String(e) })
          return false
        }
      },
      groupSelection() {
        const layers = editableSelected()
        if (layers.length === 0) return false
        let groupId = ''
        try {
          const ok = get().commit((p, c) => {
            const r = groupLayers(
              p,
              layers.map((l) => l.id),
              c
            )
            groupId = r.groupId
            return r.project
          })
          if (ok) set({ selectedIds: [groupId], anchorId: groupId })
          return ok
        } catch (e) {
          set({ lastMessage: e instanceof Error ? e.message : String(e) })
          return false
        }
      },
      ungroupSelection() {
        const groups = editableSelected().filter((l) => l.type === 'group')
        if (groups.length === 0) return false
        const kids: string[] = []
        const ok = get().commit((p, c) =>
          groups.reduce((acc, g) => {
            const r = ungroupLayer(acc, g.id, c)
            kids.push(...r.childIds)
            return r.project
          }, p)
        )
        if (ok) set({ selectedIds: kids, anchorId: kids[kids.length - 1] ?? null })
        return ok
      },
      commitText(id, content) {
        const { project } = get()
        const layer = project?.layers.find((l) => l.id === id)
        if (!project || !layer || layer.type !== 'text' || layer.content === content) return false
        return get().commit((p, c) => updateLayer(p, id, { content }, c))
      },
      undo() {
        const { project, history } = get()
        if (!project) return false
        const r = undoHistory(history, project)
        if (!r) return false
        set({
          project: r.value,
          history: r.history,
          selectedIds: prune(r.value, get().selectedIds),
          interaction: 'idle',
          editingTextId: null
        })
        void flushWorkingCopy(get)
        return true
      },
      redo() {
        const { project, history } = get()
        if (!project) return false
        const r = redoHistory(history, project)
        if (!r) return false
        set({
          project: r.value,
          history: r.history,
          selectedIds: prune(r.value, get().selectedIds),
          interaction: 'idle',
          editingTextId: null
        })
        void flushWorkingCopy(get)
        return true
      },
      clearHistory: () => set({ history: emptyHistory<TemplateProject>() }),

      selectLayer(id) {
        const { project } = get()
        if (id === null) return set({ selectedIds: [], anchorId: null })
        if (!project?.layers.some((l) => l.id === id)) return
        set({ selectedIds: [id], anchorId: id })
      },
      selectLayers(ids) {
        const { project } = get()
        const valid = ids.filter((id) => project?.layers.some((l) => l.id === id))
        set({ selectedIds: valid, anchorId: valid[valid.length - 1] ?? null })
      },
      toggleSelection(id) {
        const { project, selectedIds } = get()
        if (!project?.layers.some((l) => l.id === id)) return
        const next = toggleId(selectedIds, id)
        set({ selectedIds: next, anchorId: next.includes(id) ? id : get().anchorId })
      },
      selectRange(orderedIds, targetId) {
        const ids = rangeIds(orderedIds, get().anchorId, targetId)
        if (ids.length > 0) set({ selectedIds: ids })
      },
      toggleCollapsed(id) {
        const c = get().collapsedGroups
        set({ collapsedGroups: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] })
      },
      setLayerFilter: (layerFilter) => set({ layerFilter }),
      clearSelection: () => set({ selectedIds: [], anchorId: null }),
      beginTextEdit(id) {
        const { project } = get()
        const layer = project?.layers.find((l) => l.id === id)
        if (!project || !layer || layer.type !== 'text' || !isEditable(project.layers, layer))
          return
        set({ selectedIds: [id], editingTextId: id, interaction: 'editingText' })
      },
      endTextEdit: () => set({ editingTextId: null, interaction: 'idle' }),
      setInteraction: (interaction) => set({ interaction }),

      setViewport(size) {
        const v = get().viewport
        if (v.width !== size.width || v.height !== size.height) set({ viewport: size })
      },
      fitToWindow: () => set({ view: { mode: 'fit' } }),
      zoomIn() {
        const s = get()
        const t = selectViewTransform(s)
        if (t) set({ view: toManual(zoomStep(t, 1, s.viewport)) })
      },
      zoomOut() {
        const s = get()
        const t = selectViewTransform(s)
        if (t) set({ view: toManual(zoomStep(t, -1, s.viewport)) })
      },
      zoomToActualSize() {
        const s = get()
        const design = selectDesignSize(s)
        if (design) set({ view: toManual(centeredView(design, s.viewport, 1)) })
      },
      zoomAtPoint(factor, anchor) {
        const t = selectViewTransform(get())
        if (t) set({ view: toManual(zoomAt(t, factor, anchor)) })
      },
      panBy(dx, dy) {
        const t = selectViewTransform(get())
        if (t) set({ view: toManual(panView(t, dx, dy)) })
      },
      setSnapping: (patch) => set((s) => ({ snapping: { ...s.snapping, ...patch } })),
      setGuides(guides) {
        if (!sameGuides(get().guides, guides)) set({ guides })
      },
      setGuidesVisible: (guidesVisible) => set({ guidesVisible }),
      setPhotoDisplay: (photoDisplay) => set({ photoDisplay }),
      setMessage: (lastMessage) => set({ lastMessage })
    }
  })
}

/** On project change keep user preferences (snapping, guide visibility, photo display, viewport size). */
function initialStateKeepingUi(s: EditorState): EditorState {
  return {
    ...initialState(),
    snapping: s.snapping,
    guidesVisible: s.guidesVisible,
    photoDisplay: s.photoDisplay,
    viewport: s.viewport
  }
}
