import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  shouldAutoCollapseDrawer,
  LAYERS_SPLIT_DEFAULT,
  SIDEBAR_DEFAULT,
  clampLayersSplit,
  clampSidebarWidth,
  drawerStartsOpen
} from '@editor/layout'
import type { DslrImportPreview } from '@shared/ipc'

export type DslrImportState =
  | { kind: 'preview'; preview: DslrImportPreview }
  | { kind: 'error'; fileHint: string | null; message: string }
import { nextToolState, type ToolId } from '@editor/tools'

/**
 * UI layout state only: panel sizes, the tool drawer, collapsed inspector sections and which dialogs are open.
 * It is deliberately separate from the editor store: nothing here is part of the project, nothing here marks it
 * Modified, and resizing a panel never touches history or autosave. (Not persisted across launches yet.)
 */
interface LayoutState {
  sidebarWidth: number
  layersSplit: number
  tool: ToolId
  drawerOpen: boolean
  collapsedSections: string[]
  newProjectOpen: boolean
  exportOpen: boolean
  /** The dslrBooth import dialog: an analysed ZIP, or why it cannot be imported (null = closed). */
  dslrImport: DslrImportState | null
  setSidebarWidth(px: number): void
  setLayersSplit(fraction: number): void
  clickTool(id: ToolId): void
  toggleSection(id: string): void
  setNewProjectOpen(open: boolean): void
  setExportOpen(open: boolean): void
  setDslrImport(state: DslrImportState | null): void
}

export const layoutStore = createStore<LayoutState>((set, get) => ({
  sidebarWidth: SIDEBAR_DEFAULT,
  layersSplit: LAYERS_SPLIT_DEFAULT,
  tool: 'design',
  drawerOpen: drawerStartsOpen(window.innerWidth),
  collapsedSections: [],
  newProjectOpen: false,
  exportOpen: false,
  dslrImport: null,
  setSidebarWidth: (px) => set({ sidebarWidth: clampSidebarWidth(px, window.innerWidth) }),
  setLayersSplit: (f) => set({ layersSplit: clampLayersSplit(f) }),
  clickTool(id) {
    const next = nextToolState({ tool: get().tool, open: get().drawerOpen }, id)
    set({ tool: next.tool, drawerOpen: next.open })
  },
  toggleSection: (id) =>
    set((s) => ({
      collapsedSections: s.collapsedSections.includes(id)
        ? s.collapsedSections.filter((x) => x !== id)
        : [...s.collapsedSections, id]
    })),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setDslrImport: (dslrImport) => set({ dslrImport })
}))

export const useLayout = <T>(selector: (s: LayoutState) => T): T => useStore(layoutStore, selector)

// Shrinking the window never leaves the canvas cramped by an open drawer (see `shouldAutoCollapseDrawer`).
window.addEventListener('resize', () => {
  const s = layoutStore.getState()
  if (shouldAutoCollapseDrawer(window.innerWidth, s.drawerOpen, s.sidebarWidth))
    layoutStore.setState({ drawerOpen: false })
})
