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
import { loadProjectImage } from './assetLoader'

const api = window.api.project

/** The only bridge between the editor store and Electron: the typed preload API. */
const ports: EditorPorts = {
  create: (req) => api.create(req),
  newSample: () => api.newSample(),
  open: () => api.open(),
  openRecent: (path) => api.openRecent({ path }),
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
  discardRecovery: (sessionId) => window.api.recovery.discard({ sessionId })
}

export type ImportPlacementArg = ImportPlacement

export const editorStore = createEditorStore({ ports })
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
