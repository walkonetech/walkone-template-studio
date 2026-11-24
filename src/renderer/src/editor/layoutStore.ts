import type { FormatDefinition } from '@domain'
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

/** Settings pages (B5, B1 mockups 12a/12b). */
export type SettingsPage = 'appearance' | 'printing' | 'editor'

export type DslrImportState =
  | { kind: 'preview'; preview: DslrImportPreview }
  | { kind: 'error'; fileHint: string | null; message: string }

/**
 * UI layout state only: panel sizes, the tool drawer, the right column's tab, Properties sections opened or closed, and which
 * dialogs are open. It is deliberately separate from the editor store: nothing here is part of the project, nothing
 * here marks it Modified, and resizing a panel never touches history or autosave. Panel sizes and the right-column
 * tab are remembered on this computer (localStorage, `walkone.layout.v1`).
 */
interface LayoutState extends LayoutPrefs {
  /** The window's CSS size (drives the responsive tiers). */
  viewport: { width: number; height: number }
  tool: ToolId
  drawerOpen: boolean
  /** The Checks panel (B4): opens in the drawer's place on the left, so Properties stays visible. */
  checksOpen: boolean
  /** Properties sections the user opened or closed this session (absent = the section's default, B5). */
  sectionOpen: Readonly<Record<string, boolean>>
  /** Settings (B5): which page is open, or null when closed. */
  settingsPage: SettingsPage | null
  /** The editing session of the NEW BLANK project the getting-started tips belong to (B5), and whether they were closed. */
  tipsSession: string | null
  tipsClosed: boolean
  newProjectOpen: boolean
  /**
   * The Custom Size wizard (B5.5): null = closed; otherwise what it starts from (null format = a fresh custom size, a
   * format = My formats → Use, opened on Review) and the project name to suggest. `purpose: 'guide'` (7C): the size is
   * for the Design Guide — the wizard hands it back to the Guide instead of creating a project.
   */
  customFormat: {
    format: FormatDefinition | null
    projectName?: string
    purpose?: 'project' | 'guide'
  } | null
  exportOpen: boolean
  /** View › Printer & cutting… (B4; the Output Profile underneath: choose it and read its evidence). */
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
  setChecksOpen(open: boolean): void
  setSectionOpen(id: string, open: boolean): void
  setSettingsPage(page: SettingsPage | null): void
  startTips(sessionId: string): void
  closeTips(): void
  setNewProjectOpen(open: boolean): void
  setCustomFormat(state: LayoutState['customFormat']): void
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
  checksOpen: false,
  sectionOpen: {},
  settingsPage: null,
  tipsSession: null,
  tipsClosed: false,
  newProjectOpen: false,
  customFormat: null,
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
    // A rail category takes the left zone back from the Checks panel.
    set({ tool: next.tool, drawerOpen: next.open, checksOpen: false })
  },
  closeDrawer: () => set({ drawerOpen: false }),
  // Checks and the tool drawer share the left zone: opening one closes the other.
  setChecksOpen: (checksOpen) =>
    set(checksOpen ? { checksOpen, drawerOpen: false } : { checksOpen }),
  setSectionOpen: (id, open) => set((s) => ({ sectionOpen: { ...s.sectionOpen, [id]: open } })),
  setSettingsPage: (settingsPage) => set({ settingsPage }),
  startTips: (tipsSession) => set({ tipsSession, tipsClosed: false }),
  closeTips: () => set({ tipsClosed: true }),

  setNewProjectOpen: (newProjectOpen) => set({ newProjectOpen }),
  setCustomFormat: (customFormat) => set({ customFormat }),
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
