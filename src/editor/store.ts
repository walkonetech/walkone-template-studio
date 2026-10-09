import { createStore, type StoreApi } from 'zustand/vanilla'
import {
  assetUsage,
  getPixelSize,
  nowIso,
  type AssetReference,
  type ColorValue,
  type Layer,
  type TemplateProject
} from '@domain'
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
import type {
  CloseReason,
  ImportAssetsResult,
  DocumentRequestKind,
  DocumentResult,
  DocumentState,
  OpenProjectInfo,
  RecoveryCandidateInfo
} from '@shared/ipc'
import { createAutosaver, type AutosaveStatus, type AutosaveTimers } from './autosave'
import type { IpcResult } from '@shared/persistence'
import { isEditable, topmostIds } from '@domain'
import { createNewLayer, type NewLayerKind } from './newLayers'
import { rangeIds, toggleId } from './selection'
import {
  AssetInUseError,
  addAssetLayer,
  addAssets,
  makeLayerBackground,
  removeAsset as removeAssetMutation,
  replaceLayerAsset,
  setAssetAsBackground,
  setCanvasBackgroundColor,
  setImageOriginalSize,
  type BackgroundMode
} from './assetMutations'
import { DUPLICATE_OFFSET } from './mutations'
import {
  MIN_DISTRIBUTE,
  alignLayers,
  arrangeTargets,
  distributeLayers,
  moveSelectionTo,
  type AlignMode,
  type AlignTarget,
  type DistributeAxis
} from './arrange'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { clampCrop, type PhotoCrop } from '@canvas/rendering/photoFit'
import {
  initialPreviewPhotos,
  resetPreviewPhotos,
  setSampleOverride,
  shufflePreviewPhotos,
  type PreviewPhotoState
} from './previewPhotos'

export type Interaction = 'idle' | 'transforming' | 'editingText' | 'cropping'
export type PhotoDisplay = 'placeholder' | 'preview'
/** Design edits the authored (logical) design; Print Preview shows the derived print sheet, read-only. */
export type ViewMode = 'design' | 'preview'

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
  /** Workspace mode (editor UI state: never in the project, history or dirty state). */
  viewMode: ViewMode
  view: ViewState
  viewport: Size
  interaction: Interaction
  editingTextId: string | null
  snapping: { enabled: boolean; tolerancePx: number }
  guidesVisible: boolean
  /** Active snap guide lines (editor-only; never rendered into output or history). */
  guides: Guide[]
  photoDisplay: PhotoDisplay
  /**
   * Show artwork that extends beyond the printable artboard (default). Off = "clipped view": the editor shows only the
   * printable area. Editor presentation only: never project data, history or dirty state, and it never changes output.
   */
  showOverflow: boolean
  /** Preview-photo assignment (editor/session state, ADR-038). */
  previewPhotos: PreviewPhotoState
  /** Sample pictures the user picked from disk this session (bytes live in the renderer only). */
  userSamples: { id: string; name: string; width: number; height: number }[]
  /** Editor-only crop per photo LAYER id (shared by every derived print copy). Session state, not project data. */
  photoCrops: Readonly<Record<string, PhotoCrop>>
  /** Active Reposition mode: the layer and its crop when the mode began (Escape restores it). */
  cropSession: { layerId: string; original: PhotoCrop | null } | null
  history: History<TemplateProject>
  lastMessage: string | null
  /** Recovery-copy status for the UI: saved / pending / saving / error (never affects Modified). */
  autosave: AutosaveStatus
  /** Persistent autosave trouble (two or more consecutive failures); null when fine. */
  autosaveIssue: string | null
  /** Startup recovery candidates found by the main process. */
  recovery: {
    candidates: RecoveryCandidateInfo[]
    loaded: boolean
    quarantined: number
    /** The user chose "Decide later" for this run. */
    dismissed: boolean
  }
}

/** What an import did, for UI feedback. `layerIds` are the ImageLayers created (if any). */
export type ImportOutcome =
  | { status: 'cancelled' }
  | { status: 'error'; message: string }
  | { status: 'ok'; assetIds: string[]; layerIds: string[]; reused: number; failed: number }

/** What to do with imported assets besides adding them to the project's asset library. */
export type ImportPlacement =
  | { kind: 'library' }
  | { kind: 'canvas'; at: { x: number; y: number } | null }
  | { kind: 'background'; mode: BackgroundMode }
  | { kind: 'replace'; layerId: string }

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
  // ---- project assets & images (Phase 5A; every change is one history entry)
  /** Native picker → import into the project. Placement decides whether layers are created as well. */
  importAssetsFromDialog(placement: ImportPlacement): Promise<ImportOutcome>
  /** Dropped files (bytes held by the renderer) → import. */
  importDroppedFiles(
    files: { name: string; data: Uint8Array }[],
    placement: ImportPlacement
  ): Promise<ImportOutcome>
  addAssetToCanvas(assetId: string, at?: { x: number; y: number } | null): boolean
  setAssetAsBackground(assetId: string, mode?: BackgroundMode): boolean
  setLayerAsBackground(layerId: string, mode?: BackgroundMode): boolean
  setImageOriginalSize(layerId: string): boolean
  /** Removes an unused asset from the project; refuses (with a message) while any layer uses it. */
  removeAsset(assetId: string): boolean
  setCanvasBackgroundColor(color: ColorValue, options?: CommitOptions): boolean
  /** Deletes the design's background image layer (even though it is locked by default). */
  removeBackgroundImage(): boolean
  // ---- exact position, align, distribute (each one history entry; design coordinates)
  moveSelectionTo(to: { x?: number; y?: number }): boolean
  alignSelection(mode: AlignMode, target?: AlignTarget): boolean
  distributeSelection(axis: DistributeAxis): boolean
  // ---- workspace mode (never in history, never dirty)
  setViewMode(mode: ViewMode): void
  setShowOverflow(show: boolean): void
  // ---- preview photos and crop: editor/session state, never in the project, history or dirty state
  shufflePhotos(): void
  resetSamples(): void
  setSampleFor(photoNumber: number, sampleId: string): void
  addUserSample(sample: { id: string; name: string; width: number; height: number }): void
  setPhotoCrop(layerId: string, crop: PhotoCrop): void
  resetPhotoCrop(layerId: string): void
  /** Enters Reposition mode for a photo layer (turns Preview Photos on). */
  beginCrop(layerId: string): boolean
  /** Done: keeps the crop and leaves the mode. */
  commitCrop(): void
  /** Escape: restores the crop the mode began with and leaves the mode. */
  cancelCrop(): void
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
  // ---- document safety (close guard, recovery)
  /** Asks the main process (unsaved-changes prompt) whether the open project may be closed/replaced. */
  guardClose(reason: CloseReason): Promise<boolean>
  /** Answers main-process requests for the document state or a save (close/quit protection). */
  respondToDocumentRequest(kind: DocumentRequestKind): Promise<DocumentResult>
  /** Writes the recovery copy now if anything is pending. */
  flushRecovery(): Promise<void>
  loadRecovery(): Promise<void>
  recoverCandidate(sessionId: string): Promise<OpResult>
  discardCandidate(sessionId: string): Promise<OpResult>
  dismissRecovery(): void
}

export type EditorStore = StoreApi<EditorState & EditorActions>

export interface EditorStoreOptions {
  ports: EditorPorts
  now?: () => string
  /** Clock for history coalescing (injectable for tests). */
  clock?: () => number
  createId?: () => string
  /** Recovery-copy autosave timing (defaults: 2 s of quiet, at most 10 s between writes). */
  autosave?: { debounceMs?: number; maxWaitMs?: number; timers?: AutosaveTimers }
}

export const AUTOSAVE_DEBOUNCE_MS = 2000
export const AUTOSAVE_MAX_WAIT_MS = 10000

/** What the main process needs to guard close/quit. */
export function selectDocumentState(s: EditorState): DocumentState {
  return {
    hasProject: s.project !== null,
    dirty: selectIsDirty(s),
    name: s.project?.metadata.name ?? null,
    neverSaved: s.session !== null && s.session.fileName === null
  }
}

const initialState = (): EditorState => ({
  session: null,
  project: null,
  savedProject: null,
  selectedIds: [],
  anchorId: null,
  collapsedGroups: [],
  layerFilter: '',
  viewMode: 'design',
  view: { mode: 'fit' },
  viewport: { width: 800, height: 600 },
  interaction: 'idle',
  editingTextId: null,
  snapping: { enabled: true, tolerancePx: 10 },
  guidesVisible: true,
  guides: [],
  photoDisplay: 'placeholder',
  showOverflow: true,
  previewPhotos: initialPreviewPhotos(),
  userSamples: [],
  photoCrops: {},
  cropSession: null,
  history: emptyHistory<TemplateProject>(),
  lastMessage: null,
  autosave: { state: 'idle', lastSavedAt: null, failures: 0, error: null },
  autosaveIssue: null,
  recovery: { candidates: [], loaded: false, quarantined: 0, dismissed: false }
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
/** The mode actually shown: Print Preview only exists while the project prints several copies per sheet. */
export const selectViewMode = (s: EditorState): ViewMode =>
  s.viewMode === 'preview' && s.project !== null && hasDerivedCopies(s.project)
    ? 'preview'
    : 'design'
/** What the workspace frames: the design in Design mode, the print sheet in Print Preview. */
export function selectWorkspaceSize(s: EditorState): Size | null {
  if (!s.project) return null
  return selectViewMode(s) === 'preview'
    ? getPixelSize(s.project.output.print)
    : getPixelSize(s.project.canvas.print)
}
export function selectViewTransform(s: EditorState): ViewTransform | null {
  const size = selectWorkspaceSize(s)
  // Print Preview leaves room around the sheet for its editor-only labels (copy names, cut line).
  return size
    ? resolveView(
        s.view,
        size,
        s.viewport,
        selectViewMode(s) === 'preview' ? PREVIEW_PADDING : undefined
      )
    : null
}
export const PREVIEW_PADDING = 56
/** Selecting something else ends Reposition mode (the crop made so far is kept). */
const LEAVE_CROP = (s: EditorState): Partial<EditorState> =>
  s.cropSession ? { cropSession: null, interaction: 'idle' } : {}
const READ_ONLY_MESSAGE = 'Print Preview is read-only. Switch to Design to edit.'

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

  return createStore<EditorState & EditorActions>()((set, get) => {
    // Recovery-copy autosave: debounced, latest content wins, never touches Modified or history (ADR-034).
    const autosaver = createAutosaver({
      debounceMs: options.autosave?.debounceMs ?? AUTOSAVE_DEBOUNCE_MS,
      maxWaitMs: options.autosave?.maxWaitMs ?? AUTOSAVE_MAX_WAIT_MS,
      ...(options.autosave?.timers ? { timers: options.autosave.timers } : {}),
      write: async () => {
        const { session, project } = get()
        if (!session || !project) return
        const r = await ports.updateWorkingCopy(session.sessionId, project)
        if (r.status === 'error') throw new Error(r.error.message)
      },
      onStatus: (autosave) =>
        set({
          autosave,
          autosaveIssue:
            autosave.failures >= 2
              ? 'Recovery copies could not be saved. Your work is still open; save the project to be safe.'
              : null
        })
    })
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
      autosaver.notify()
    }

    const editableSelected = (): Layer[] => {
      const { project, selectedIds } = get()
      if (!project) return []
      // Topmost only: a group and its own child are never processed twice by a bulk operation.
      return topmostIds(project.layers, selectedIds)
        .map((id) => project.layers.find((l) => l.id === id))
        .filter((l): l is Layer => l !== undefined && isEditable(project.layers, l))
    }

    // A newly opened/created/recovered project always starts with fresh undo history (history is not persisted).
    const adoptInfo = (info: OpenProjectInfo): void => {
      autosaver.reset()
      set({
        ...initialStateKeepingUi(get()),
        session: { sessionId: info.sessionId, fileName: info.fileName },
        project: info.project,
        savedProject: info.dirty ? null : info.project,
        history: emptyHistory<TemplateProject>(),
        lastMessage: info.warnings.length > 0 ? info.warnings.join(' ') : null
      })
    }

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

    const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e))

    /** Runs a project mutation; a refused mutation (e.g. asset in use) becomes a message, never a throw. */
    const tryCommit = (
      mutate: (p: TemplateProject, c: MutationContext) => TemplateProject,
      o: CommitOptions = {}
    ): boolean => {
      try {
        return get().commit(mutate, o)
      } catch (e) {
        set({ lastMessage: messageOf(e) })
        return false
      }
    }

    const describeFailures = (failures: ImportAssetsResult['failures']): string => {
      const first = failures[0]
      if (!first) return ''
      const more =
        failures.length > 1 ? ` (and ${failures.length - 1} more could not be imported)` : ''
      return `${first.filename}: ${first.error.message}${more}`
    }

    /**
     * Turns an import result into ONE history entry: the new asset records plus whatever the placement asks for
     * (image layers at the drop point, a background, or a replacement on one layer). Imports that change nothing
     * (identical content, library placement, already in the project) leave history alone.
     */
    const finishImport = (
      sessionId: string,
      result: ImportAssetsResult,
      placement: ImportPlacement
    ): ImportOutcome => {
      if (get().session?.sessionId !== sessionId) {
        return { status: 'error', message: 'The project was closed before the import finished.' }
      }
      const assets: AssetReference[] = []
      for (const i of result.imported)
        if (!assets.some((a) => a.id === i.asset.id)) assets.push(i.asset)
      const reused = result.imported.filter((i) => i.deduplicated).length
      const failed = result.failures.length
      const layerIds: string[] = []
      if (assets.length > 0) {
        const ok = tryCommit((p, c) => {
          let next = addAssets(p, assets, c)
          if (placement.kind === 'canvas') {
            assets.forEach((a, i) => {
              const at = placement.at
                ? {
                    x: placement.at.x + i * DUPLICATE_OFFSET,
                    y: placement.at.y + i * DUPLICATE_OFFSET
                  }
                : null
              const r = addAssetLayer(next, a.id, at, c)
              next = r.project
              layerIds.push(r.layerId)
            })
          } else if (placement.kind === 'background') {
            const first = assets[0] as AssetReference
            const r = setAssetAsBackground(next, first.id, placement.mode, c)
            next = r.project
            layerIds.push(r.layerId)
          } else if (placement.kind === 'replace') {
            next = replaceLayerAsset(next, placement.layerId, assets[0] as AssetReference, c)
          }
          return next
        })
        if (ok && layerIds.length > 0)
          set({ selectedIds: layerIds, anchorId: layerIds[layerIds.length - 1] ?? null })
      }
      const notes = [
        failed > 0 ? describeFailures(result.failures) : '',
        reused > 0
          ? `${reused} file${reused === 1 ? ' was' : 's were'} already in the project and reused.`
          : ''
      ].filter(Boolean)
      if (notes.length > 0) set({ lastMessage: notes.join(' ') })
      if (assets.length === 0 && failed > 0)
        return { status: 'error', message: describeFailures(result.failures) }
      return { status: 'ok', assetIds: assets.map((a) => a.id), layerIds, reused, failed }
    }

    const runImport = async (
      start: (sessionId: string) => Promise<IpcResult<ImportAssetsResult>>,
      placement: ImportPlacement
    ): Promise<ImportOutcome> => {
      const { session, project } = get()
      if (!session || !project) return { status: 'error', message: 'No project is open.' }
      try {
        const r = await start(session.sessionId)
        if (r.status === 'cancelled') return { status: 'cancelled' }
        if (r.status === 'error') {
          set({ lastMessage: r.error.message })
          return { status: 'error', message: r.error.message }
        }
        return finishImport(session.sessionId, r.value, placement)
      } catch (e) {
        set({ lastMessage: messageOf(e) })
        return { status: 'error', message: messageOf(e) }
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
        autosaver.reset()
        set({ ...initialStateKeepingUi(get()), lastMessage: null })
        return { status: 'ok' }
      },

      commit(mutate, o = {}) {
        const { project } = get()
        if (!project) return false
        if (selectViewMode(get()) === 'preview') {
          // Print Preview shows derived copies; artwork is edited only in Design mode.
          set({ lastMessage: READ_ONLY_MESSAGE })
          return false
        }
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
        if (get().cropSession) return false
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
      importAssetsFromDialog: (placement) =>
        runImport(
          (id) =>
            ports.importAssets(id, placement.kind === 'library' || placement.kind === 'canvas'),
          placement
        ),
      importDroppedFiles: (files, placement) =>
        runImport((id) => ports.importAssetData(id, files), placement),
      addAssetToCanvas(assetId, at = null) {
        let layerId = ''
        const ok = tryCommit((p, c) => {
          const r = addAssetLayer(p, assetId, at, c)
          layerId = r.layerId
          return r.project
        })
        if (ok) set({ selectedIds: [layerId], anchorId: layerId })
        return ok
      },
      setAssetAsBackground(assetId, mode = 'cover') {
        let layerId = ''
        const ok = tryCommit((p, c) => {
          const r = setAssetAsBackground(p, assetId, mode, c)
          layerId = r.layerId
          return r.project
        })
        if (ok) set({ selectedIds: [layerId], anchorId: layerId })
        return ok
      },
      setLayerAsBackground(layerId, mode = 'cover') {
        const ok = tryCommit((p, c) => makeLayerBackground(p, layerId, mode, c))
        if (ok) set({ selectedIds: [layerId], anchorId: layerId })
        return ok
      },
      setImageOriginalSize: (layerId) => tryCommit((p, c) => setImageOriginalSize(p, layerId, c)),
      removeAsset(assetId) {
        const { project } = get()
        if (project) {
          const usage = assetUsage(project, assetId)
          if (usage.total > 0) {
            set({ lastMessage: new AssetInUseError(assetId, usage.total).message })
            return false
          }
        }
        return tryCommit((p, c) => removeAssetMutation(p, assetId, c))
      },
      removeBackgroundImage() {
        const { project } = get()
        const ids =
          project?.layers
            .filter(
              (l) => l.type === 'image' && l.role === 'background' && l.parentId === undefined
            )
            .map((l) => l.id) ?? []
        if (ids.length === 0) return false
        const ok = tryCommit((p, c) =>
          ids.reduce(
            (acc, id) => (acc.layers.some((l) => l.id === id) ? removeLayer(acc, id, c) : acc),
            p
          )
        )
        if (ok) set({ selectedIds: get().selectedIds.filter((id) => !ids.includes(id)) })
        return ok
      },
      setCanvasBackgroundColor: (color, o = {}) =>
        tryCommit((p, c) => setCanvasBackgroundColor(p, color, c), o),

      moveSelectionTo(to) {
        const { project, selectedIds } = get()
        if (!project || arrangeTargets(project, selectedIds).length === 0) return false
        return get().commit((p, c) => moveSelectionTo(p, selectedIds, to, c))
      },
      alignSelection(mode, target) {
        const { project, selectedIds } = get()
        if (!project) return false
        const count = arrangeTargets(project, selectedIds).length
        if (count === 0) return false
        // One layer can only be aligned to the canvas; several default to the selection.
        const effective: AlignTarget = count === 1 ? 'canvas' : (target ?? 'selection')
        return get().commit((p, c) => alignLayers(p, selectedIds, mode, effective, c))
      },
      distributeSelection(axis) {
        const { project, selectedIds } = get()
        if (!project || arrangeTargets(project, selectedIds).length < MIN_DISTRIBUTE) return false
        return get().commit((p, c) => distributeLayers(p, selectedIds, axis, c))
      },
      setShowOverflow: (showOverflow) => set({ showOverflow }),
      shufflePhotos: () => set((s) => ({ previewPhotos: shufflePreviewPhotos(s.previewPhotos) })),
      resetSamples: () => set({ previewPhotos: resetPreviewPhotos() }),
      setSampleFor: (photoNumber, sampleId) =>
        set((s) => ({ previewPhotos: setSampleOverride(s.previewPhotos, photoNumber, sampleId) })),
      addUserSample: (sample) =>
        set((s) => ({
          userSamples: s.userSamples.some((u) => u.id === sample.id)
            ? s.userSamples
            : [...s.userSamples, sample]
        })),
      setPhotoCrop: (layerId, crop) =>
        set((s) => ({ photoCrops: { ...s.photoCrops, [layerId]: clampCrop(crop) } })),
      resetPhotoCrop(layerId) {
        const { [layerId]: _dropped, ...rest } = get().photoCrops
        void _dropped
        set({ photoCrops: rest })
      },
      beginCrop(layerId) {
        const s = get()
        const layer = s.project?.layers.find((l) => l.id === layerId)
        if (!s.project || !layer || layer.type !== 'photo' || selectViewMode(s) !== 'design')
          return false
        if (!isEditable(s.project.layers, layer)) return false
        set({
          selectedIds: [layerId],
          anchorId: layerId,
          photoDisplay: 'preview',
          interaction: 'cropping',
          editingTextId: null,
          cropSession: { layerId, original: s.photoCrops[layerId] ?? null }
        })
        return true
      },
      commitCrop() {
        if (get().cropSession) set({ cropSession: null, interaction: 'idle' })
      },
      cancelCrop() {
        const { cropSession, photoCrops } = get()
        if (!cropSession) return
        const rest = { ...photoCrops }
        if (cropSession.original) rest[cropSession.layerId] = cropSession.original
        else delete rest[cropSession.layerId]
        set({ photoCrops: rest, cropSession: null, interaction: 'idle' })
      },
      setViewMode(mode) {
        const s = get()
        if (s.viewMode === mode) return
        // The workspace frames a different size, so go back to "fit"; end any text edit. Nothing here is document state.
        set({
          cropSession: null,
          lastMessage: s.lastMessage === READ_ONLY_MESSAGE ? null : s.lastMessage,
          viewMode: mode,
          view: { mode: 'fit' },
          guides: [],
          editingTextId: null,
          interaction: 'idle'
        })
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
        autosaver.notify()
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
        autosaver.notify()
        return true
      },
      clearHistory: () => set({ history: emptyHistory<TemplateProject>() }),

      selectLayer(id) {
        const { project } = get()
        if (id === null) return set({ selectedIds: [], anchorId: null, ...LEAVE_CROP(get()) })
        if (!project?.layers.some((l) => l.id === id)) return
        set({
          selectedIds: [id],
          anchorId: id,
          ...(get().cropSession?.layerId === id ? {} : LEAVE_CROP(get()))
        })
      },
      selectLayers(ids) {
        const { project } = get()
        const valid = ids.filter((id) => project?.layers.some((l) => l.id === id))
        set({ selectedIds: valid, anchorId: valid[valid.length - 1] ?? null, ...LEAVE_CROP(get()) })
      },
      toggleSelection(id) {
        const { project, selectedIds } = get()
        if (!project?.layers.some((l) => l.id === id)) return
        const next = toggleId(selectedIds, id)
        set({
          selectedIds: next,
          anchorId: next.includes(id) ? id : get().anchorId,
          ...LEAVE_CROP(get())
        })
      },
      selectRange(orderedIds, targetId) {
        const ids = rangeIds(orderedIds, get().anchorId, targetId)
        if (ids.length > 0) set({ selectedIds: ids, ...LEAVE_CROP(get()) })
      },
      toggleCollapsed(id) {
        const c = get().collapsedGroups
        set({ collapsedGroups: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] })
      },
      setLayerFilter: (layerFilter) => set({ layerFilter }),
      clearSelection: () => set({ selectedIds: [], anchorId: null, ...LEAVE_CROP(get()) }),
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
        const size = selectWorkspaceSize(s)
        if (size) set({ view: toManual(centeredView(size, s.viewport, 1)) })
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
      setMessage: (lastMessage) => set({ lastMessage }),

      async guardClose(reason) {
        if (!selectIsDirty(get())) return true
        try {
          const r = await ports.requestClose(reason)
          return r.status === 'ok' && r.value.proceed
        } catch {
          return false
        }
      },
      async respondToDocumentRequest(kind) {
        if (kind === 'state') return { kind: 'state', state: selectDocumentState(get()) }
        const r = await get().save()
        if (r.status === 'ok') return { kind: 'save', status: 'saved' }
        if (r.status === 'cancelled') return { kind: 'save', status: 'cancelled' }
        return { kind: 'save', status: 'failed', message: r.message }
      },
      flushRecovery: () => autosaver.flush(),
      async loadRecovery() {
        try {
          const r = await ports.recoveryList()
          if (r.status === 'ok') {
            set((s) => ({
              recovery: {
                ...s.recovery,
                candidates: r.value.candidates,
                quarantined: r.value.quarantined,
                loaded: true
              }
            }))
          }
        } catch {
          set((s) => ({ recovery: { ...s.recovery, loaded: true } }))
        }
      },
      async recoverCandidate(sessionId) {
        const result = await run(() => ports.recover(sessionId))
        if (result.status === 'ok') {
          set((s) => ({
            recovery: {
              ...s.recovery,
              candidates: s.recovery.candidates.filter((c) => c.sessionId !== sessionId)
            }
          }))
        }
        return result
      },
      async discardCandidate(sessionId) {
        try {
          const r = await ports.discardRecovery(sessionId)
          if (r.status === 'error') {
            set({ lastMessage: r.error.message })
            return { status: 'error', message: r.error.message }
          }
          set((s) => ({
            recovery: {
              ...s.recovery,
              candidates: s.recovery.candidates.filter((c) => c.sessionId !== sessionId)
            }
          }))
          return { status: 'ok' }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          set({ lastMessage: message })
          return { status: 'error', message }
        }
      },
      dismissRecovery: () => set((s) => ({ recovery: { ...s.recovery, dismissed: true } }))
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
    showOverflow: s.showOverflow,
    viewport: s.viewport,
    recovery: s.recovery
  }
}
