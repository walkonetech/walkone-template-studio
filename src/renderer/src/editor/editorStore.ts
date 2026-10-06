import { useMemo } from 'react'
import { useStore } from 'zustand'
import { getPixelSize } from '@domain'
import { resolveView, type ViewTransform } from '@canvas/viewport/viewport'
import { ImageCache } from '@canvas/assets/imageCache'
import type { EditorPorts } from '@editor/ports'
import { createEditorStore, type EditorActions, type EditorState } from '@editor/store'
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
  recents: () => api.recents()
}

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
  const print = useEditor((s) => s.project?.canvas.print ?? null)
  return useMemo(
    () => (print ? resolveView(view, getPixelSize(print), viewport) : null),
    [view, viewport, print]
  )
}
