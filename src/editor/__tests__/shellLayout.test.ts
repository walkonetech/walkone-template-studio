import { describe, expect, it } from 'vitest'
import { TemplateProjectSchema, createProject, type TemplateProject } from '@domain'
import {
  CANVAS_STATE_CONTROLS,
  DEFAULT_LAYOUT_PREFS,
  DRAWER_WIDTH_DEFAULT,
  DRAWER_WIDTH_MAX,
  DRAWER_WIDTH_MIN,
  RAIL_WIDTH,
  RAIL_WIDTH_COMPACT,
  REGION_ORDER,
  SIDEBAR_BY_TIER,
  clampDrawerWidth,
  closeDrawerOnTierChange,
  defaultSidebarWidth,
  drawerClosesOnCanvasClick,
  drawerMode,
  drawerStartsOpen,
  escapeTarget,
  nextRegion,
  parseLayoutPrefs,
  railWidth,
  rightColumnLayout,
  safeAreasControl,
  sidebarWidthFor,
  topBarPresentation,
  workspaceWidth
} from '../layout'
import { heightTier, widthTier } from '../responsive'
import { TOOLS, nextToolState } from '../tools'
import {
  COMMANDS,
  MENUS,
  isCommandChecked,
  isCommandEnabled,
  shortcutLabel,
  type CommandContext
} from '../commands'
import { formatPlaceholderSize, recentFormatLabel, recentMeta } from '../welcome'
import { placeFloating } from '../floatingPlacement'
import { createEditorStore, selectCanRedo, selectCanUndo, selectIsDirty } from '../store'
import { fakePorts, T0, photo, text } from './helpers'

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  hasProject: true,
  canUndo: false,
  canRedo: false,
  selectionCount: 0,
  snapping: true,
  previewPhotos: false,
  hasPrintPreview: true,
  showOverflow: true,
  hasOutputProfile: false,
  showSafeAreas: true,
  viewMode: 'design' as const,
  ...over
})

describe('B3 responsive tiers', () => {
  it('1 width tier: ≥1600 wide, 1280–1599 medium, below narrow', () => {
    expect(widthTier(1920)).toBe('wide')
    expect(widthTier(1600)).toBe('wide')
    expect(widthTier(1599)).toBe('medium')
    expect(widthTier(1426)).toBe('medium')
    expect(widthTier(1280)).toBe('medium')
    expect(widthTier(1100)).toBe('narrow')
  })
  it('2 height tier: ≥860 tall, 720–859 short, below very short', () => {
    expect(heightTier(1000)).toBe('tall')
    expect(heightTier(860)).toBe('tall')
    expect(heightTier(779)).toBe('short')
    expect(heightTier(650)).toBe('very-short')
  })
})

describe('B3 tool drawer', () => {
  it('3 docks on roomy windows (≥1600 px) and starts open there', () => {
    expect(drawerMode(1920)).toBe('docked')
    expect(drawerMode(1600)).toBe('docked')
    expect(drawerStartsOpen(1920)).toBe(true)
    // A docked drawer takes its own column: the canvas loses exactly its width.
    const without = workspaceWidth(1920, { drawerOpen: false, sidebarWidth: 340, hasProject: true })
    const withIt = workspaceWidth(1920, { drawerOpen: true, sidebarWidth: 340, hasProject: true })
    expect(without - withIt).toBe(DRAWER_WIDTH_DEFAULT)
  })
  it('4 floats on narrower windows (1426, 1280, 1100), starts closed and never takes canvas width', () => {
    for (const w of [1599, 1426, 1280, 1100]) {
      expect(drawerMode(w)).toBe('floating')
      expect(drawerStartsOpen(w)).toBe(false)
      expect(workspaceWidth(w, { drawerOpen: true, sidebarWidth: 300, hasProject: true })).toBe(
        workspaceWidth(w, { drawerOpen: false, sidebarWidth: 300, hasProject: true })
      )
    }
    // Crossing from docked to floating closes an open drawer; the other way leaves it alone.
    expect(closeDrawerOnTierChange(1920, 1426, true)).toBe(true)
    expect(closeDrawerOnTierChange(1426, 1920, true)).toBe(false)
    expect(closeDrawerOnTierChange(1920, 1426, false)).toBe(false)
  })
  it('5 width: 264 px default, resizable 240–360 px', () => {
    expect(DRAWER_WIDTH_DEFAULT).toBe(264)
    expect(clampDrawerWidth(100)).toBe(DRAWER_WIDTH_MIN)
    expect(clampDrawerWidth(1000)).toBe(DRAWER_WIDTH_MAX)
    expect(clampDrawerWidth(300)).toBe(300)
    expect(clampDrawerWidth(NaN)).toBe(DRAWER_WIDTH_DEFAULT)
    expect([DRAWER_WIDTH_MIN, DRAWER_WIDTH_MAX]).toEqual([240, 360])
  })
  it('6 drawer and panel state live outside the project (remembered UI prefs only)', () => {
    expect(Object.keys(DEFAULT_LAYOUT_PREFS).sort()).toEqual(
      ['drawerWidth', 'layersSplit', 'rightTab', 'sidebarWidth'].sort()
    )
    const shape = Object.keys(TemplateProjectSchema.shape)
    for (const k of [...Object.keys(DEFAULT_LAYOUT_PREFS), 'drawerOpen', 'tool'])
      expect(shape).not.toContain(k)
    // Field-by-field fallback: a damaged stored value can never break the shell.
    expect(parseLayoutPrefs(null)).toEqual(DEFAULT_LAYOUT_PREFS)
    expect(parseLayoutPrefs({ drawerWidth: 9999, layersSplit: 'x', rightTab: 'nope' })).toEqual({
      ...DEFAULT_LAYOUT_PREFS,
      drawerWidth: DRAWER_WIDTH_MAX
    })
    expect(parseLayoutPrefs({ sidebarWidth: 300, rightTab: 'layers' })).toMatchObject({
      sidebarWidth: 300,
      rightTab: 'layers'
    })
  })
  it('7 a FLOATING drawer closes on a canvas click; a docked one does not', () => {
    expect(drawerClosesOnCanvasClick('floating')).toBe(true)
    expect(drawerClosesOnCanvasClick('docked')).toBe(false)
  })
  it('8 adding elements never changes the drawer state (it stays open for several adds)', async () => {
    // The drawer state is (tool, open); only rail clicks, Close, Escape, a canvas click or a tier change alter it.
    // Adding is a store action that knows nothing about the drawer: prove adds leave every rule's inputs alone.
    const store = createEditorStore({ ports: fakePorts(strip()) })
    await store.getState().openFromDialog()
    const before = { tool: 'elements' as const, open: true }
    for (const k of ['photo', 'text', 'rectangle', 'ellipse', 'line'] as const)
      expect(store.getState().addNewLayer(k)).toBe(true)
    expect(nextToolState(before, 'elements')).toEqual({ tool: 'elements', open: false }) // only a re-click closes
    expect(store.getState().project?.layers.length).toBe(5 + 1)
  })
  it('9 rail categories: Elements, Text, Photos, Uploads, Colors; selecting switches, re-selecting closes', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['elements', 'text', 'photos', 'uploads', 'colors'])
    let state = { tool: 'elements' as (typeof TOOLS)[number]['id'], open: false }
    state = nextToolState(state, 'photos')
    expect(state).toEqual({ tool: 'photos', open: true })
    state = nextToolState(state, 'colors')
    expect(state).toEqual({ tool: 'colors', open: true })
    state = nextToolState(state, 'colors')
    expect(state).toEqual({ tool: 'colors', open: false })
    expect(RAIL_WIDTH).toBe(80)
    expect(railWidth('compact')).toBe(RAIL_WIDTH_COMPACT)
  })
})

describe('B3 top bar', () => {
  it('10 platform labels: ⌘ on macOS, Ctrl elsewhere (Open, Undo, Redo, stacking)', () => {
    expect(shortcutLabel(COMMANDS['file.open'].shortcut, true)).toBe('⌘O')
    expect(shortcutLabel(COMMANDS['file.open'].shortcut, false)).toBe('Ctrl+O')
    expect(shortcutLabel(COMMANDS['edit.undo'].shortcut, false)).toBe('Ctrl+Z')
    expect(shortcutLabel(COMMANDS['arrange.bringToFront'].shortcut, true)).toBe('⇧⌘]')
    expect(shortcutLabel(COMMANDS['arrange.sendBackward'].shortcut, false)).toBe('Ctrl+[')
  })
  it('the menus are File, Edit, Arrange, View, Help with unique access letters', () => {
    expect(MENUS.map((m) => m.label)).toEqual(['File', 'Edit', 'Arrange', 'View', 'Help'])
    const letters = MENUS.map((m) => m.label[0])
    expect(new Set(letters).size).toBe(letters.length)
    expect(MENUS.find((m) => m.id === 'help')?.items).toContain('help.shortcuts')
    expect(MENUS.find((m) => m.id === 'arrange')?.items).toContain('arrange.bringToFront')
  })
  it('17 responsive labels: words while there is room, shorter when narrow or Compact', () => {
    expect(topBarPresentation(1920, 'comfortable')).toMatchObject({
      undoRedoWords: true,
      previewLabel: 'See how it prints'
    })
    expect(topBarPresentation(1426, 'comfortable')).toMatchObject({
      undoRedoWords: true,
      previewLabel: 'See how it prints'
    })
    expect(topBarPresentation(1100, 'comfortable')).toMatchObject({
      undoRedoWords: false,
      previewLabel: 'Preview'
    })
    expect(topBarPresentation(1920, 'compact').undoRedoWords).toBe(false)
  })
  it('18 Export stays available at every supported width and density', () => {
    for (const w of [1100, 1280, 1426, 1600, 1920])
      for (const d of ['comfortable', 'compact'] as const) {
        expect(topBarPresentation(w, d).exportVisible).toBe(true)
        expect(topBarPresentation(w, d).checksWord).toBe(true)
      }
    expect(isCommandEnabled('file.export', ctx())).toBe(true)
  })
  it('19 the right column and the title never squeeze the canvas below 520 px at the minimum window', () => {
    // The title is flexible and ellipsizes (CSS); the fixed parts must leave the canvas its minimum width.
    for (const [w, d] of [
      [1100, 'comfortable'],
      [1100, 'compact']
    ] as const)
      expect(
        workspaceWidth(w, {
          drawerOpen: false,
          sidebarWidth: defaultSidebarWidth(w),
          hasProject: true,
          density: d
        })
      ).toBeGreaterThanOrEqual(520)
  })
})

describe('B3 canvas-state bar', () => {
  it('holds view controls only (the B1 rule)', () => {
    expect([...CANVAS_STATE_CONTROLS]).toEqual(['mode', 'samplePhotos', 'safeAreas', 'overflow'])
    for (const id of [
      'view.design',
      'view.printPreview',
      'view.previewPhotos',
      'view.safeAreas',
      'view.showOverflow'
    ] as const)
      expect(COMMANDS[id].needsSelection).toBeUndefined()
  })
  it('11 Design / Print Preview exists only when the project prints several copies per sheet', () => {
    expect(isCommandEnabled('view.printPreview', ctx({ hasPrintPreview: true }))).toBe(true)
    expect(isCommandEnabled('view.printPreview', ctx({ hasPrintPreview: false }))).toBe(false)
  })
  it('12 Sample photos: On/Off', () => {
    expect(COMMANDS['view.previewPhotos'].label).toBe('Sample photos')
    expect(isCommandChecked('view.previewPhotos', ctx({ previewPhotos: true }))).toBe(true)
    expect(isCommandChecked('view.previewPhotos', ctx({ previewPhotos: false }))).toBe(false)
  })
  it('13 Safe areas: unavailable (with its reason) without an output profile, else On/Off', () => {
    expect(safeAreasControl(false, true)).toEqual({
      value: 'No profile',
      pressed: false,
      disabled: true
    })
    expect(safeAreasControl(true, true)).toEqual({ value: 'On', pressed: true, disabled: false })
    expect(safeAreasControl(true, false)).toEqual({ value: 'Off', pressed: false, disabled: false })
    expect(isCommandEnabled('view.safeAreas', ctx({ hasOutputProfile: false }))).toBe(false)
  })
  it('14 Overflow: Show/Hide', () => {
    expect(isCommandChecked('view.showOverflow', ctx({ showOverflow: true }))).toBe(true)
    expect(isCommandChecked('view.showOverflow', ctx({ showOverflow: false }))).toBe(false)
  })
})

const strip = (): TemplateProject => {
  const p = createProject({ name: 'S', design: 'strip-2x6-600', now: T0, createId: () => 'p' })
  return { ...p, layers: [photo('ph1', 1)] }
}

describe('B3 right column', () => {
  it('15 Properties and Layers stack at ≥ 860 px tall and become tabs below', () => {
    expect(rightColumnLayout(1000)).toBe('stacked')
    expect(rightColumnLayout(860)).toBe('stacked')
    expect(rightColumnLayout(779)).toBe('tabs')
    expect(rightColumnLayout(650)).toBe('tabs')
  })
  it('right column width follows the tier until the user resizes it', () => {
    expect(SIDEBAR_BY_TIER).toEqual({ wide: 340, medium: 300, narrow: 280 })
    expect(sidebarWidthFor(null, 1920)).toBe(340)
    expect(sidebarWidthFor(null, 1426)).toBe(300)
    expect(sidebarWidthFor(null, 1100)).toBe(280)
    expect(sidebarWidthFor(400, 1920)).toBe(400)
  })
  it('16 every canvas-state and panel action leaves the project, Modified state and history alone', async () => {
    const ports = fakePorts({ ...strip(), layers: [photo('ph1', 1), text('t1', 2)] })
    const store = createEditorStore({ ports })
    await store.getState().openFromDialog()
    const s = store.getState
    const before = {
      json: JSON.stringify(s().project),
      dirty: selectIsDirty(s()),
      undo: selectCanUndo(s()),
      redo: selectCanRedo(s()),
      history: s().history
    }
    s().setViewMode('preview')
    s().setViewMode('design')
    s().setPhotoDisplay('preview')
    s().shufflePhotos()
    s().setPhotoDisplay('placeholder')
    s().setShowOverflow(false)
    s().setShowOverflow(true)
    s().setShowSafeAreas(false)
    s().setShowSafeAreas(true)
    s().setSnapping({ enabled: false })
    s().dismissRecovery()
    s().reviewRecovery()
    expect(JSON.stringify(s().project)).toBe(before.json)
    expect(selectIsDirty(s())).toBe(before.dirty)
    expect(selectCanUndo(s())).toBe(before.undo)
    expect(selectCanRedo(s())).toBe(before.redo)
    expect(s().history).toBe(before.history)
  })
})

describe('B3 Escape order and F6 regions', () => {
  it('Escape closes one thing at a time: popover, floating drawer, Reposition, selection', () => {
    const all = {
      popoverOpen: true,
      floatingDrawerOpen: true,
      repositioning: true,
      hasSelection: true
    }
    expect(escapeTarget(all)).toBe('popover')
    expect(escapeTarget({ ...all, popoverOpen: false })).toBe('floating-drawer')
    expect(escapeTarget({ ...all, popoverOpen: false, floatingDrawerOpen: false })).toBe(
      'reposition'
    )
    expect(
      escapeTarget({
        popoverOpen: false,
        floatingDrawerOpen: false,
        repositioning: false,
        hasSelection: true
      })
    ).toBe('selection')
    expect(
      escapeTarget({
        popoverOpen: false,
        floatingDrawerOpen: false,
        repositioning: false,
        hasSelection: false
      })
    ).toBeNull()
  })
  it('F6 cycles top bar → rail → drawer → canvas-state bar → canvas → panels → status bar, skipping absent ones', () => {
    expect([...REGION_ORDER]).toEqual([
      'topbar',
      'rail',
      'drawer',
      'viewbar',
      'canvas',
      'sidebar',
      'statusbar'
    ])
    const noDrawer = REGION_ORDER.filter((r) => r !== 'drawer')
    expect(nextRegion('rail', noDrawer)).toBe('viewbar')
    expect(nextRegion('statusbar', noDrawer)).toBe('topbar')
    expect(nextRegion('topbar', noDrawer, true)).toBe('statusbar')
    expect(nextRegion(null, noDrawer)).toBe('topbar')
    expect(nextRegion('rail', [...REGION_ORDER])).toBe('drawer')
    expect(nextRegion(null, [])).toBeNull()
  })
})

describe('B3 Start screen', () => {
  it('recent cards name the print format in words', () => {
    expect(recentFormatLabel({ width: 2, height: 6 })).toBe('2×6 strip')
    expect(recentFormatLabel({ width: 4, height: 6 })).toBe('4×6 portrait')
    expect(recentFormatLabel({ width: 6, height: 4 })).toBe('6×4 landscape')
    expect(recentFormatLabel({ width: 5, height: 5 })).toBe('5×5 square')
    expect(recentFormatLabel(undefined)).toBeNull()
  })
  it('the format placeholder keeps the aspect ratio inside its box', () => {
    expect(formatPlaceholderSize({ width: 2, height: 6 }, 102)).toEqual({ width: 34, height: 102 })
    expect(formatPlaceholderSize({ width: 6, height: 4 }, 90)).toEqual({ width: 90, height: 60 })
    expect(formatPlaceholderSize(undefined, 90)).toEqual({ width: 60, height: 90 })
  })
  it('recent meta: format · opened when (format omitted for entries without it)', () => {
    const now = new Date('2026-11-19T12:00:00Z')
    expect(
      recentMeta({ lastOpenedAt: '2026-11-18T10:00:00Z', print: { width: 2, height: 6 } }, now)
    ).toBe('2×6 strip · opened yesterday')
    expect(recentMeta({ lastOpenedAt: '2026-11-19T11:59:30Z' }, now)).toBe('opened just now')
  })
})

describe('B3 tooltip containment on the new shell controls', () => {
  it('20 rail (right of the rail), drawer Close, canvas-state bar and status bar tooltips stay inside', () => {
    const tip = { width: 260, height: 64 }
    const inside = (
      vp: { width: number; height: number },
      p: { left: number; top: number }
    ): boolean =>
      p.left >= 8 &&
      p.top >= 8 &&
      p.left + tip.width <= vp.width - 8 &&
      p.top + tip.height <= vp.height - 8
    for (const vp of [
      { width: 1426, height: 779 },
      { width: 1100, height: 650 },
      { width: 1920, height: 1000 }
    ]) {
      const anchors = [
        { anchor: { left: 6, top: 60, width: 68, height: 64 }, preferred: 'right' as const }, // rail Elements
        {
          anchor: { left: 6, top: vp.height - 120, width: 68, height: 64 },
          preferred: 'right' as const
        }, // rail Colors
        { anchor: { left: 300, top: 110, width: 28, height: 28 }, preferred: 'bottom' as const }, // drawer Close
        { anchor: { left: 560, top: 56, width: 150, height: 32 }, preferred: 'bottom' as const }, // view pill
        {
          anchor: { left: vp.width - 60, top: 6, width: 100, height: 38 },
          preferred: 'bottom' as const
        }, // Export
        {
          anchor: { left: vp.width - 120, top: vp.height - 26, width: 50, height: 22 },
          preferred: 'top' as const
        } // Snap
      ]
      for (const a of anchors)
        expect(inside(vp, placeFloating({ ...a, size: tip, viewport: vp }))).toBe(true)
    }
  })
})
