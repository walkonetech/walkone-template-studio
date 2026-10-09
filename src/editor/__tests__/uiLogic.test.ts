import { describe, expect, it } from 'vitest'
import {
  DRAWER_WIDTH,
  LAYERS_SPLIT_MAX,
  LAYERS_SPLIT_MIN,
  RAIL_WIDTH,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  clampLayersSplit,
  clampSidebarWidth,
  drawerStartsOpen,
  shouldAutoCollapseDrawer,
  workspaceWidth
} from '../layout'
import {
  COMMANDS,
  MENUS,
  commandForKey,
  isCommandChecked,
  isCommandEnabled,
  shortcutLabel,
  type CommandContext,
  type CommandId
} from '../commands'
import {
  DEFAULT_PRESET,
  PRESET_OPTIONS,
  describeWhen,
  presetLabel,
  shouldShowWelcome
} from '../welcome'
import { TOOLS, nextToolState } from '../tools'

const ctx = (over: Partial<CommandContext> = {}): CommandContext => ({
  hasProject: true,
  canUndo: false,
  canRedo: false,
  selectionCount: 0,
  snapping: true,
  previewPhotos: false,
  hasPrintPreview: false,
  showOverflow: true,
  viewMode: 'design' as const,
  ...over
})

describe('layout rules', () => {
  it('clamps sidebar width and layers split to sane bounds', () => {
    expect(clampSidebarWidth(10)).toBe(SIDEBAR_MIN)
    expect(clampSidebarWidth(5000)).toBe(SIDEBAR_MAX)
    expect(clampSidebarWidth(NaN)).toBeGreaterThanOrEqual(SIDEBAR_MIN)
    expect(clampLayersSplit(0)).toBe(LAYERS_SPLIT_MIN)
    expect(clampLayersSplit(1)).toBe(LAYERS_SPLIT_MAX)
    expect(clampLayersSplit(0.5)).toBe(0.5)
  })

  it('never lets the sidebar take more than its share of a small window', () => {
    expect(clampSidebarWidth(520, 1100)).toBeLessThanOrEqual(Math.floor(1100 * 0.45))
    expect(clampSidebarWidth(520, 600)).toBe(SIDEBAR_MIN) // the minimum still wins
  })

  it('collapses the tool drawer on narrower windows', () => {
    expect(drawerStartsOpen(1280)).toBe(false)
    expect(drawerStartsOpen(1440)).toBe(true)
  })

  it('leaves the canvas a usable width at the minimum and the default laptop window size', () => {
    // The drawer starts collapsed below 1360 px, so these are the real layouts.
    const min = { drawerOpen: drawerStartsOpen(1100), sidebarWidth: SIDEBAR_MAX, hasProject: true }
    expect(workspaceWidth(1100, min)).toBeGreaterThanOrEqual(500)
    const laptop = { drawerOpen: drawerStartsOpen(1280), sidebarWidth: 320, hasProject: true }
    expect(workspaceWidth(1280, laptop)).toBeGreaterThanOrEqual(850)
    expect(workspaceWidth(1100, { drawerOpen: false, sidebarWidth: 320, hasProject: false })).toBe(
      1100 - RAIL_WIDTH
    )
    expect(DRAWER_WIDTH).toBeGreaterThan(0)
  })
})

describe('drawer auto-collapse', () => {
  it('collapses an open drawer only when the canvas would be cramped', () => {
    expect(shouldAutoCollapseDrawer(1100, true, 320)).toBe(true)
    expect(shouldAutoCollapseDrawer(1280, true, 320)).toBe(false)
    expect(shouldAutoCollapseDrawer(1100, false, 320)).toBe(false)
  })
  it('a collapsed drawer never reopens by this rule (growing the window does nothing)', () => {
    expect(shouldAutoCollapseDrawer(1920, false, 320)).toBe(false)
  })
})

describe('command model', () => {
  it('only New and Open work without a project', () => {
    const enabled = (Object.keys(COMMANDS) as CommandId[]).filter((id) =>
      isCommandEnabled(
        id,
        ctx({ hasProject: false, canUndo: true, canRedo: true, selectionCount: 3 })
      )
    )
    expect(enabled.sort()).toEqual(['file.new', 'file.open'])
  })

  it('selection commands need a selection; undo/redo follow history', () => {
    expect(isCommandEnabled('edit.duplicate', ctx())).toBe(false)
    expect(isCommandEnabled('edit.duplicate', ctx({ selectionCount: 1 }))).toBe(true)
    expect(isCommandEnabled('edit.group', ctx({ selectionCount: 2 }))).toBe(true)
    expect(isCommandEnabled('edit.undo', ctx())).toBe(false)
    expect(isCommandEnabled('edit.undo', ctx({ canUndo: true }))).toBe(true)
    expect(isCommandEnabled('edit.redo', ctx({ canUndo: true }))).toBe(false)
    expect(isCommandEnabled('file.save', ctx())).toBe(true)
  })

  it('checkable commands reflect state', () => {
    expect(isCommandChecked('view.snap', ctx({ snapping: true }))).toBe(true)
    expect(isCommandChecked('view.previewPhotos', ctx({ previewPhotos: false }))).toBe(false)
    expect(isCommandChecked('file.save', ctx())).toBeUndefined()
  })

  it('formats shortcuts per platform', () => {
    expect(shortcutLabel(COMMANDS['edit.redo'].shortcut, true)).toBe('⇧⌘Z')
    expect(shortcutLabel(COMMANDS['edit.redo'].shortcut, false)).toBe('Ctrl+Shift+Z')
    expect(shortcutLabel(COMMANDS['edit.delete'].shortcut, false)).toBe('Delete')
    expect(shortcutLabel(undefined, true)).toBe('')
  })

  it('every menu entry is a known command and no diagnostic command is exposed', () => {
    for (const m of MENUS) for (const i of m.items) if (i !== '-') expect(COMMANDS[i]).toBeDefined()
    const labels = MENUS.flatMap((m) => m.items).map((i) => (i === '-' ? '' : COMMANDS[i].label))
    expect(labels.join(' ').toLowerCase()).not.toMatch(/sample|devtools|debug/)
  })
})

describe('welcome state', () => {
  it('shows the welcome screen exactly when no project is open', () => {
    expect(shouldShowWelcome(false)).toBe(true)
    expect(shouldShowWelcome(true)).toBe(false)
  })

  it('describes recent times without paths', () => {
    const now = new Date('2026-10-07T12:00:00Z')
    const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString()
    expect(describeWhen(ago(10_000), now)).toBe('just now')
    expect(describeWhen(ago(5 * 60_000), now)).toBe('5 minutes ago')
    expect(describeWhen(ago(60_000), now)).toBe('1 minute ago')
    expect(describeWhen(ago(3 * 3600_000), now)).toBe('3 hours ago')
    expect(describeWhen(ago(30 * 3600_000), now)).toBe('yesterday')
    expect(describeWhen(ago(4 * 86400_000), now)).toBe('4 days ago')
    expect(describeWhen('nonsense', now)).toBe('')
  })

  it('labels every print preset readably, and the default exists', () => {
    expect(presetLabel('photo-4x6-portrait-600')).toBe('4×6 Portrait · 600 DPI')
    expect(presetLabel('strip-2x6-300')).toBe('2×6 Strip · 300 DPI')
    expect(PRESET_OPTIONS.map((o) => o.value)).toContain(DEFAULT_PRESET)
    expect(new Set(PRESET_OPTIONS.map((o) => o.label)).size).toBe(PRESET_OPTIONS.length)
  })
})

describe('tool rail state', () => {
  it('clicking the active tool toggles the drawer; another available tool opens it', () => {
    expect(nextToolState({ tool: 'design', open: true }, 'design')).toEqual({
      tool: 'design',
      open: false
    })
    expect(nextToolState({ tool: 'design', open: false }, 'design')).toEqual({
      tool: 'design',
      open: true
    })
  })

  it('planned tools never change state', () => {
    const cur = { tool: 'design' as const, open: false }
    for (const t of TOOLS.filter((x) => x.status === 'planned'))
      expect(nextToolState(cur, t.id)).toBe(cur)
  })

  it('planned tools carry an honest note', () => {
    for (const t of TOOLS.filter((x) => x.status === 'planned'))
      expect(t.note).toMatch(/later phase/)
  })
})

describe('shortcut matching', () => {
  const k = (key: string, shiftKey = false) => ({ key, shiftKey })
  it('maps the documented shortcuts', () => {
    expect(commandForKey(k('n'), true)).toBe('file.new')
    expect(commandForKey(k('o'), true)).toBe('file.open')
    expect(commandForKey(k('s'), true)).toBe('file.save')
    expect(commandForKey(k('S', true), true)).toBe('file.saveAs')
    expect(commandForKey(k('z'), true)).toBe('edit.undo')
    expect(commandForKey(k('Z', true), true)).toBe('edit.redo')
    expect(commandForKey(k('0'), true)).toBe('view.fit')
    expect(commandForKey(k('1'), true)).toBe('view.actual')
  })
  it('zoom keys accept = and + (with or without Shift) and -', () => {
    expect(commandForKey(k('='), true)).toBe('view.zoomIn')
    expect(commandForKey(k('+', true), true)).toBe('view.zoomIn')
    expect(commandForKey(k('-'), true)).toBe('view.zoomOut')
  })
  it('requires the modifier, and unrelated keys map to nothing', () => {
    expect(commandForKey(k('n'), false)).toBeNull()
    expect(commandForKey(k('q'), true)).toBeNull()
  })
  it('every shortcut shown in a menu is reachable by commandForKey', () => {
    const ids = MENUS.flatMap((m) => m.items).filter((i): i is CommandId => i !== '-')
    for (const id of ids) {
      const sc = COMMANDS[id].shortcut
      if (!sc || !sc.mod) continue // Delete has no modifier and is handled by the canvas keyboard
      const key = sc.match?.[0] ?? sc.key.toLowerCase()
      expect(commandForKey({ key, shiftKey: !!sc.shift }, true)).toBe(id)
    }
  })
})
