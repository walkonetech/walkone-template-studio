import { useMemo } from 'react'
import { useStore } from 'zustand'
import { getPixelSize } from '@domain'
import { resolveView, type ViewTransform } from '@canvas/viewport/viewport'
import { ImageCache } from '@canvas/assets/imageCache'
import type { EditorPorts } from '@editor/ports'
import {
  PREVIEW_PADDING,
  createEditorStore,
  selectViewMode,
  type EditorActions,
  type EditorState,
  type ImportPlacement
} from '@editor/store'
import { measureTextHeight } from '@canvas/rendering/measureText'
import { loadProjectImage } from './assetLoader'

const api = window.api.project

/** The only bridge between the editor store and Electron: the typed preload API. */
const ports: EditorPorts = {
  create: (req) => api.create(req),
  newSample: () => api.newSample(),
  open: () => api.open(),
  openRecent: (path) => api.openRecent({ path }),
  locateRecent: (path) => api.locateRecent({ path }),
  save: (sessionId, project) => api.save({ sessionId, project }),
  saveAs: (sessionId, project) => api.saveAs({ sessionId, project }),
  updateWorkingCopy: (sessionId, project) => api.updateWorkingCopy({ sessionId, project }),
  close: (sessionId) => api.close({ sessionId }),
  recents: () => api.recents(),
  importAssets: (sessionId, multiple) => api.importAssets({ sessionId, multiple }),
  importAssetData: (sessionId, files) => api.importAssetData({ sessionId, files }),
  requestClose: (reason) => window.api.document.requestClose({ reason }),
  recoveryList: () => window.api.recovery.list(),
  recover: (sessionId) => window.api.recovery.recover({ sessionId }),
  discardRecovery: (sessionId) => window.api.recovery.discard({ sessionId }),
  dslrImportCommit: (token, layout) => window.api.dslrImport.commit({ token, layout })
}

export type ImportPlacementArg = ImportPlacement

export const editorStore = createEditorStore({ ports, measureTextHeight })

/**
 * The selected Output Profile and the Safe areas toggle are a per-computer preference (ADR-053): remembered in this
 * app's browser storage, never in the project. Storage can be unavailable or cleared; the editor then simply starts
 * with no profile selected.
 */
const OUTPUT_PREFS_KEY = 'walkone.outputProfile.v1'
try {
  const saved = JSON.parse(window.localStorage.getItem(OUTPUT_PREFS_KEY) ?? 'null') as {
    profileId?: unknown
    showSafeAreas?: unknown
    showCutGuides?: unknown
  } | null
  if (saved && typeof saved === 'object') {
    const s = editorStore.getState()
    if (typeof saved.profileId === 'string') s.setOutputProfile(saved.profileId)
    if (typeof saved.showSafeAreas === 'boolean') s.setShowSafeAreas(saved.showSafeAreas)
    if (typeof saved.showCutGuides === 'boolean') s.setShowCutGuides(saved.showCutGuides)
  }
} catch {
  // unreadable or unavailable storage: keep the defaults
}
editorStore.subscribe((s, prev) => {
  if (
    s.outputProfileId === prev.outputProfileId &&
    s.showSafeAreas === prev.showSafeAreas &&
    s.showCutGuides === prev.showCutGuides
  )
    return
  try {
    window.localStorage.setItem(
      OUTPUT_PREFS_KEY,
      JSON.stringify({
        profileId: s.outputProfileId,
        showSafeAreas: s.showSafeAreas,
        showCutGuides: s.showCutGuides
      })
    )
  } catch {
    // storage unavailable: the choice lasts for this run only
  }
})

export const imageCache = new ImageCache(loadProjectImage)

export function useEditor<T>(selector: (state: EditorState & EditorActions) => T): T {
  return useStore(editorStore, selector)
}

/**
 * The resolved view transform for the current project and viewport. Selected as stable pieces and
 * memoized, because a selector that builds a new object each call would make the store hook loop.
 */
export function useViewTransform(): ViewTransform | null {
  const view = useEditor((s) => s.view)
  const viewport = useEditor((s) => s.viewport)
  const mode = useEditor(selectViewMode)
  const project = useEditor((s) => s.project)
  return useMemo(() => {
    if (!project) return null
    // The workspace frames the design in Design mode and the print sheet in Print Preview.
    const size = getPixelSize(mode === 'preview' ? project.output.print : project.canvas.print)
    return resolveView(view, size, viewport, mode === 'preview' ? PREVIEW_PADDING : undefined)
  }, [view, viewport, mode, project])
}
