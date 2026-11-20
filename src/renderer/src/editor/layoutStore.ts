import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  DEFAULT_LAYOUT_PREFS,
  LAYOUT_STORAGE_KEY,
  clampDrawerWidth,
  clampLayersSplit,
  clampSidebarWidth,
  closeDrawerOnTierChange,
  drawerStartsOpen,
  parseLayoutPrefs,
  shouldAutoCollapseDrawer,
  sidebarWidthFor,
  type LayoutPrefs,
  type RightTab
} from '@editor/layout'
import type { DslrImportPreview } from '@shared/ipc'
import { nextToolState, type ToolId } from '@editor/tools'

export type DslrImportState =
  | { kind: 'preview'; preview: DslrImportPreview }
  | { kind: 'error'; fileHint: string | null; message: string }

/**
 * UI layout state only: panel sizes, the tool drawer, the right column's tab, collapsed inspector sections and which
 * dialogs are open. It is deliberately separate from the editor store: nothing here is part of the project, nothing
 * here marks it Modified, and resizing a panel never touches history or autosave. Panel sizes and the right-column
 * tab are remembered on this computer (localStorage, `walkone.layout.v1`).
 */
interface LayoutState extends LayoutPrefs {
  /** The window's CSS size (drives the responsive tiers). */
  viewport: { width: number; height: number }
  tool: ToolId
  drawerOpen: boolean
  collapsedSections: string[]
  newProjectOpen: boolean
  exportOpen: boolean
  /** View › Output profile… (choose the profile and read its evidence). */
  outputProfileOpen: boolean
  /** Help › Keyboard shortcuts… */
  shortcutsOpen: boolean
  /** The dslrBooth import dialog: an analysed ZIP, or why it cannot be imported (null = closed). */
  dslrImport: DslrImportState | null
  setSidebarWidth(px: number): void
  setLayersSplit(fraction: number): void
  setDrawerWidth(px: number): void
  setRightTab(tab: RightTab): void
  clickTool(id: ToolId): void
  closeDrawer(): void
  toggleSection(id: string): void
  setNewProjectOpen(open: boolean): void
  setExportOpen(open: boolean): void
  setOutputProfileOpen(open: boolean): void
  setShortcutsOpen(open: boolean): void
  setDslrImport(state: DslrImportState | null): void
  setViewport(size: { width: number; height: number }): void
}

const storage = (): Storage | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function loadPrefs(): LayoutPrefs {
  try {
    const raw = storage()?.getItem(LAYOUT_STORAGE_KEY)
    return parseLayoutPrefs(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_LAYOUT_PREFS }
  }
}

const initialViewport = { width: window.innerWidth, height: window.innerHeight }

export const layoutStore = createStore<LayoutState>((set, get) => ({
  ...loadPrefs(),
  viewport: initialViewport,
  tool: 'elements',
  drawerOpen: drawerStartsOpen(initialViewport.width),
  collapsedSections: [],
  newProjectOpen: false,
  exportOpen: false,
  outputProfileOpen: false,
  shortcutsOpen: false,
  dslrImport: null,
  setSidebarWidth: (px) => set({ sidebarWidth: clampSidebarWidth(px, get().viewport.width) }),
  setLayersSplit: (f) => set({ layersSplit: clampLayersSplit(f) }),
  setDrawerWidth: (px) => set({ drawerWidth: clampDrawerWidth(px) }),
  setRightTab: (rightTab) => set({ rightTab }),
  clickTool(id) {
    const next = nextToolState({ tool: get().tool, open: get().drawerOpen }, id)
    set({ tool: next.tool, drawerOpen: next.open })
  },
  closeDrawer: () => set({ drawerOpen: false }),
  toggleSection: (id) =>
    set((s) => ({
      collapsedSections: s.collapsedSections.includes(id)
        ? s.collapsedSections.filter((x) => x !== id)
        : [...s.collapsedSections, id]
    })),
  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setOutputProfileOpen: (outputProfileOpen) => set({ outputProfileOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  setDslrImport: (dslrImport) => set({ dslrImport }),
  setViewport(size) {
    const s = get()
    const width = sidebarWidthFor(s.sidebarWidth, size.width)
    const close =
      closeDrawerOnTierChange(s.viewport.width, size.width, s.drawerOpen) ||
      shouldAutoCollapseDrawer(size.width, s.drawerOpen, width, s.drawerWidth)
    set({ viewport: size, ...(close ? { drawerOpen: false } : {}) })
  }
}))

export const useLayout = <T>(selector: (s: LayoutState) => T): T => useStore(layoutStore, selector)

// Remember sizes and the right-column tab on this computer (never in the project).
layoutStore.subscribe((s, prev) => {
  if (
    s.drawerWidth === prev.drawerWidth &&
    s.layersSplit === prev.layersSplit &&
    s.sidebarWidth === prev.sidebarWidth &&
    s.rightTab === prev.rightTab
  )
    return
  try {
    const prefs: LayoutPrefs = {
      drawerWidth: s.drawerWidth,
      layersSplit: s.layersSplit,
      sidebarWidth: s.sidebarWidth,
      rightTab: s.rightTab
    }
    storage()?.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage may be unavailable (private mode, quota): sizes then last for this session only.
  }
})

window.addEventListener('resize', () =>
  layoutStore.getState().setViewport({ width: window.innerWidth, height: window.innerHeight })
)
