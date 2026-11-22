import { useEffect, useRef, useState } from 'react'
import { imageKey } from '@canvas/assets/imageCache'
import { renderOutputToCanvas, renderProjectToCanvas } from '@canvas/rendering/renderProject'
import {
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  drawerMode,
  drawerOpenAfterModeChange,
  rightColumnLayout,
  sidebarWidthFor
} from '@editor/layout'
import { selectViewMode } from '@editor/store'
import { EditorCanvas } from './EditorCanvas'
import { PrintPreviewCanvas } from './PrintPreviewCanvas'
import { CanvasStateBar } from './CanvasStateBar'
import { ShortcutsDialog } from './ShortcutsDialog'
import { SettingsDialog } from './SettingsDialog'
import { loadFontCatalog } from './fontCatalog'
import { editorStore, imageCache, useEditor } from './editorStore'
import { installDebug } from './debugHooks'
import { layoutStore, useLayout } from './layoutStore'
import { LayersPanel } from './LayersPanel'
import { NewProjectDialog } from './NewProjectDialog'
import { ExportDialog } from './ExportDialog'
import { DslrImportDialog } from './DslrImportDialog'
import { OutputProfileDialog } from './OutputProfileDialog'
import { PropertiesInspector } from './PropertiesInspector'
import { RecoveryDialog } from './RecoveryDialog'
import { StatusBar } from './StatusBar'
import { ToolDrawer, ToolRail } from './ToolRail'
import { ChecksPanel } from './ChecksButton'
import { TopBar } from './TopBar'
import { Welcome } from './Welcome'
import { useEditorKeyboard } from './useEditorKeyboard'
import { Splitter } from '../ui/Splitter'
import { Tabs } from '../ui/Tabs'

/**
 * Right-hand column (B1): Properties ABOVE Layers with a draggable/keyboard splitter on windows at least 860 CSS px
 * tall; Properties | Layers tabs on shorter ones, so neither is squeezed to an unusable height. Its width follows the
 * window tier (340 / 300 / 280 px) until the user resizes it. Sizes and the chosen tab are UI state of this computer
 * (layoutStore): resizing or switching never touches the project, history or autosave.
 */
function Sidebar(): React.JSX.Element {
  const stored = useLayout((s) => s.sidebarWidth)
  const viewport = useLayout((s) => s.viewport)
  const split = useLayout((s) => s.layersSplit)
  const tab = useLayout((s) => s.rightTab)
  const layerCount = useEditor((s) => s.project?.layers.length ?? 0)
  const width = sidebarWidthFor(stored, viewport.width)
  const layout = rightColumnLayout(viewport.height)
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
      <aside
        className={`sidebar ${layout}`}
        aria-label="Properties and layers"
        style={{ width }}
        ref={column}
        data-region="sidebar"
        data-layout={layout}
      >
        {layout === 'stacked' ? (
          <>
            <div className="sidebar-pane properties-pane" style={{ flex: `${1 - split} 1 0` }}>
              <PropertiesInspector />
            </div>
            <Splitter
              orientation="horizontal"
              label="Resize Layers and Properties"
              value={(1 - split) * height}
              min={0}
              max={height}
              invert={false}
              onChange={(px) => layoutStore.getState().setLayersSplit(1 - px / height)}
            />
            <div className="sidebar-pane layers-pane" style={{ flex: `${split} 1 0` }}>
              <LayersPanel />
            </div>
          </>
        ) : (
          <Tabs
            label="Side panel"
            value={tab}
            onChange={(t) => layoutStore.getState().setRightTab(t)}
            tabs={[
              { value: 'properties', label: 'Properties' },
              {
                value: 'layers',
                label: 'Layers',
                badge: <span className="ui-count">{layerCount}</span>
              }
            ]}
          >
            <div className="sidebar-pane">
              {tab === 'properties' ? <PropertiesInspector /> : <LayersPanel />}
            </div>
          </Tabs>
        )}
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
  const viewportWidth = useLayout((s) => s.viewport.width)

  // Main-process requests (document state for close/quit protection, save-before-close) and startup recovery.
  useEffect(() => {
    window.api.document.setHandler((kind) => editorStore.getState().respondToDocumentRequest(kind))
    void editorStore.getState().loadRecovery()
    void loadFontCatalog() // installed-font names (the app works without them)
  }, [])

  // Print Preview is read only: entering it closes the creation drawer (B3.1). Leaving it never reopens the drawer.
  useEffect(() => {
    let before = selectViewMode(editorStore.getState())
    return editorStore.subscribe((s) => {
      const after = selectViewMode(s)
      if (after === before) return
      const l = layoutStore.getState()
      if (l.drawerOpen && !drawerOpenAfterModeChange(before, after, true)) l.closeDrawer()
      before = after
    })
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

  const mode = drawerMode(viewportWidth)
  return (
    <div className="editor" data-has-project={project ? 'true' : 'false'}>
      <RecoveryDialog />
      <NewProjectDialog />
      <ExportDialog />
      <DslrImportDialog />
      <OutputProfileDialog />
      <ShortcutsDialog />
      <SettingsDialog />
      <TopBar />
      <div className="editor-body">
        {project && <ToolRail />}
        {project && mode === 'docked' && <ToolDrawer mode="docked" />}
        {project && mode === 'docked' && <ChecksPanel mode="docked" />}
        <div className="canvas-column">
          {project && <CanvasStateBar />}
          <main className="workspace" aria-label="Canvas workspace" data-region="canvas">
            {project ? (
              viewMode === 'preview' ? (
                <PrintPreviewCanvas />
              ) : (
                <EditorCanvas />
              )
            ) : (
              <Welcome />
            )}
            {project && mode === 'floating' && <ToolDrawer mode="floating" />}
            {project && mode === 'floating' && <ChecksPanel mode="floating" />}
          </main>
        </div>
        {project && <Sidebar />}
      </div>
      <StatusBar />
    </div>
  )
}
