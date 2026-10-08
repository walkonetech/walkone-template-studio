import { useEffect, useRef, useState } from 'react'
import { imageKey } from '@canvas/assets/imageCache'
import { renderOutputToCanvas, renderProjectToCanvas } from '@canvas/rendering/renderProject'
import { SIDEBAR_MAX, SIDEBAR_MIN } from '@editor/layout'
import { selectViewMode } from '@editor/store'
import { EditorCanvas } from './EditorCanvas'
import { PrintPreviewCanvas } from './PrintPreviewCanvas'
import { WorkspaceModeSwitch } from './WorkspaceModeSwitch'
import { editorStore, imageCache, useEditor } from './editorStore'
import { installDebug } from './debugHooks'
import { layoutStore, useLayout } from './layoutStore'
import { LayersPanel } from './LayersPanel'
import { NewProjectDialog } from './NewProjectDialog'
import { PropertiesInspector } from './PropertiesInspector'
import { RecoveryDialog } from './RecoveryDialog'
import { StatusBar } from './StatusBar'
import { ToolDrawer, ToolRail } from './ToolRail'
import { TopBar } from './TopBar'
import { Welcome } from './Welcome'
import { useEditorKeyboard } from './useEditorKeyboard'
import { Splitter } from '../ui/Splitter'

/**
 * Right-hand column: Layers above Properties (both stay visible so selecting and editing never needs a tab switch),
 * with a draggable/keyboard splitter between them and another on the column's left edge for its width. Sizes are UI
 * state only (layoutStore): resizing never touches the project, history or autosave.
 */
function Sidebar(): React.JSX.Element {
  const width = useLayout((s) => s.sidebarWidth)
  const split = useLayout((s) => s.layersSplit)
  const column = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(600)
  useEffect(() => {
    const el = column.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])
  return (
    <>
      <Splitter
        orientation="vertical"
        label="Resize side panels"
        value={width}
        min={SIDEBAR_MIN}
        max={SIDEBAR_MAX}
        invert
        onChange={(w) => layoutStore.getState().setSidebarWidth(w)}
      />
      <aside className="sidebar" aria-label="Layers and properties" style={{ width }} ref={column}>
        <div className="sidebar-pane" style={{ flex: `${split} 1 0` }}>
          <LayersPanel />
        </div>
        <Splitter
          orientation="horizontal"
          label="Resize Layers and Properties"
          value={split * height}
          min={0}
          max={height}
          invert={false}
          onChange={(px) => layoutStore.getState().setLayersSplit(px / height)}
        />
        <div className="sidebar-pane" style={{ flex: `${1 - split} 1 0` }}>
          <PropertiesInspector />
        </div>
      </aside>
    </>
  )
}

type DebugRenderer = typeof renderProjectToCanvas

/** Development hook: renders the open project (design or print sheet) offscreen at an exact size. */
async function renderDebug(
  render: DebugRenderer,
  width?: number,
  height?: number
): Promise<{ width: number; height: number; dataUrl: string; ms: number }> {
  const s = editorStore.getState()
  if (!s.project || !s.session) throw new Error('no project')
  const sessionId = s.session.sessionId
  const ids = new Set<string>()
  for (const l of s.project.layers) {
    if (l.type === 'image') ids.add(l.assetId)
  }
  await imageCache.ensure([...ids].map((id) => imageKey(sessionId, id)))
  const t0 = performance.now()
  const canvas = render(s.project, (id) => imageCache.peek(imageKey(sessionId, id)), {
    ...(width ? { width } : {}),
    ...(height ? { height } : {})
  })
  return {
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/png'),
    ms: Math.round(performance.now() - t0)
  }
}

export function EditorScreen(): React.JSX.Element {
  useEditorKeyboard()
  const project = useEditor((s) => s.project)
  const viewMode = useEditor(selectViewMode)

  // Main-process requests (document state for close/quit protection, save-before-close) and startup recovery.
  useEffect(() => {
    window.api.document.setHandler((kind) => editorStore.getState().respondToDocumentRequest(kind))
    void editorStore.getState().loadRecovery()
  }, [])

  // A file dropped outside a drop target must never navigate the window to it: ignore it quietly.
  useEffect(() => {
    const stop = (e: DragEvent): void => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  useEffect(() => {
    installDebug({
      store: editorStore,
      imageCache,
      renderToDataUrl: (width, height) => renderDebug(renderProjectToCanvas, width, height),
      renderSheetToDataUrl: (width, height) => renderDebug(renderOutputToCanvas, width, height)
    })
  }, [])

  return (
    <div className="editor">
      <RecoveryDialog />
      <NewProjectDialog />
      <TopBar />
      <div className="editor-body">
        {project && <ToolRail />}
        {project && <ToolDrawer />}
        <main className="workspace" aria-label="Canvas workspace">
          {project ? (
            viewMode === 'preview' ? (
              <PrintPreviewCanvas />
            ) : (
              <EditorCanvas />
            )
          ) : (
            <Welcome />
          )}
          {project && <WorkspaceModeSwitch />}
        </main>
        {project && <Sidebar />}
      </div>
      <StatusBar />
    </div>
  )
}
