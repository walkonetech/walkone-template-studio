import { describe, expect, it } from 'vitest'
import { TemplateProjectSchema, createProject, type TemplateProject } from '@domain'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  THEME_PREFS,
  DENSITIES,
  UI_SCALES,
  appearanceAttributes,
  isUiScale,
  loadAppearancePrefs,
  parseAppearancePrefs,
  resolveTheme,
  saveAppearancePrefs,
  serializeAppearancePrefs,
  uiScaleLabel,
  type AppearancePrefs,
  type PrefStorage
} from '../appearance'
import { WINDOW_BACKGROUND } from '@shared/appearance'
import {
  COMMANDS,
  MENUS,
  isCommandChecked,
  isCommandEnabled,
  type CommandContext
} from '../commands'
import { createEditorStore, selectCanRedo, selectCanUndo, selectIsDirty } from '../store'
import { fakePorts, T0, text } from './helpers'

const memory = (): PrefStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v)
  }
}

describe('appearance preferences (B2, ADR-055)', () => {
  it('defaults: Light theme, Comfortable density, 100 % scale, getting-started tips on, selection toolbar on (B5)', () => {
    expect(DEFAULT_APPEARANCE).toEqual({
      theme: 'light',
      density: 'comfortable',
      uiScale: 1,
      showGettingStartedTips: true,
      showSelectionToolbar: true
    })
    expect(loadAppearancePrefs(memory())).toEqual(DEFAULT_APPEARANCE)
    expect(loadAppearancePrefs(null)).toEqual(DEFAULT_APPEARANCE)
  })

  it('the theme persists locally (Dark survives a save/load round trip)', () => {
    const st = memory()
    expect(saveAppearancePrefs(st, { ...DEFAULT_APPEARANCE, theme: 'dark' })).toBe(true)
    expect(st.data.has(APPEARANCE_STORAGE_KEY)).toBe(true)
    expect(loadAppearancePrefs(st).theme).toBe('dark')
  })

  it('Compact persists', () => {
    const st = memory()
    saveAppearancePrefs(st, { ...DEFAULT_APPEARANCE, density: 'compact' })
    expect(loadAppearancePrefs(st)).toEqual({ ...DEFAULT_APPEARANCE, density: 'compact' })
  })

  it('Match system follows the operating system; explicit themes ignore it', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    const attrs = appearanceAttributes({ ...DEFAULT_APPEARANCE, theme: 'system' }, true)
    expect(attrs['data-theme']).toBe('dark')
    expect(attrs['data-theme-pref']).toBe('system')
  })

  it('UI scale accepts only 90 / 100 / 110 / 125 %', () => {
    expect(UI_SCALES).toEqual([0.9, 1, 1.1, 1.25])
    for (const s of UI_SCALES) expect(isUiScale(s)).toBe(true)
    for (const bad of [0, 0.5, 1.05, 1.5, 2, '1', null, NaN, Infinity])
      expect(isUiScale(bad)).toBe(false)
    expect(parseAppearancePrefs({ uiScale: 3 }).uiScale).toBe(1)
    expect(parseAppearancePrefs({ uiScale: 1.25 }).uiScale).toBe(1.25)
    expect(UI_SCALES.map(uiScaleLabel)).toEqual(['90 %', '100 %', '110 %', '125 %'])
  })

  it('the getting-started tips preference defaults on and can be turned off', () => {
    expect(parseAppearancePrefs({}).showGettingStartedTips).toBe(true)
    expect(parseAppearancePrefs({ showGettingStartedTips: false }).showGettingStartedTips).toBe(
      false
    )
    expect(parseAppearancePrefs({ showGettingStartedTips: 'no' }).showGettingStartedTips).toBe(true)
  })

  it('damaged or unknown stored values fall back field by field, never throwing', () => {
    const st = memory()
    st.setItem(APPEARANCE_STORAGE_KEY, '{not json')
    expect(loadAppearancePrefs(st)).toEqual(DEFAULT_APPEARANCE)
    st.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: 'purple', density: 'compact' }))
    expect(loadAppearancePrefs(st)).toEqual({ ...DEFAULT_APPEARANCE, density: 'compact' })
    const throwing: PrefStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      }
    }
    expect(loadAppearancePrefs(throwing)).toEqual(DEFAULT_APPEARANCE)
    expect(saveAppearancePrefs(throwing, DEFAULT_APPEARANCE)).toBe(false)
  })

  it('serialises only the known fields', () => {
    const extra = { ...DEFAULT_APPEARANCE, secret: 'x' } as unknown as AppearancePrefs
    expect(Object.keys(JSON.parse(serializeAppearancePrefs(extra))).sort()).toEqual(
      ['density', 'showGettingStartedTips', 'showSelectionToolbar', 'theme', 'uiScale'].sort()
    )
  })

  it('the window background mirrors the app surface of each theme', () => {
    expect(WINDOW_BACKGROUND.light).toBe('#f6f6f9')
    expect(WINDOW_BACKGROUND.dark).toBe('#17181c')
  })
})

describe('appearance commands (View menu, interim until Settings)', () => {
  const ctx: CommandContext = {
    hasProject: false,
    canUndo: false,
    canRedo: false,
    selectionCount: 0,
    snapping: true,
    hasPrintPreview: false,
    showOverflow: false,
    viewMode: 'design',
    hasOutputProfile: false,
    showSafeAreas: true,
    theme: 'light',
    density: 'comfortable'
  }
  const ids = [
    'view.themeLight',
    'view.themeDark',
    'view.themeSystem',
    'view.densityComfortable',
    'view.densityCompact'
  ] as const

  it('are available without a project and show the current choice as checked', () => {
    for (const id of ids) expect(isCommandEnabled(id, ctx)).toBe(true)
    expect(ids.map((id) => isCommandChecked(id, ctx))).toEqual([true, false, false, true, false])
    expect(
      ids.map((id) => isCommandChecked(id, { ...ctx, theme: 'system', density: 'compact' }))
    ).toEqual([false, false, true, false, true])
  })

  it('are listed in the View menu and have no shortcuts that could collide with editing keys', () => {
    const view = MENUS.find((m) => m.id === 'view')
    for (const id of ids) {
      expect(view?.items).toContain(id)
      expect(COMMANDS[id].shortcut).toBeUndefined()
    }
  })
})

describe('appearance is never project state', () => {
  const project = (): TemplateProject => {
    const p = createProject({ name: 'A', design: 'strip-2x6-600', now: T0, createId: () => 'p' })
    return { ...p, layers: [text('t1', 1)] }
  }

  it('TemplateProject has no appearance fields and rejects them', () => {
    const p = project()
    const keys = ['theme', 'density', 'uiScale', 'showGettingStartedTips']
    for (const k of keys) expect(Object.keys(TemplateProjectSchema.shape)).not.toContain(k)
    expect(TemplateProjectSchema.safeParse({ ...p, theme: 'dark' }).success).toBe(false)
    expect(TemplateProjectSchema.safeParse(p).success).toBe(true)
  })

  it('changing every appearance preference leaves the project, Modified state, undo history and ports untouched', async () => {
    const ports = fakePorts(project())
    const store = createEditorStore({ ports })
    await store.getState().openFromDialog()
    const s = store.getState
    const before = {
      json: JSON.stringify(s().project),
      dirty: selectIsDirty(s()),
      undo: selectCanUndo(s()),
      redo: selectCanRedo(s()),
      calls: ports.calls.length,
      history: s().history
    }
    const st = memory()
    for (const theme of THEME_PREFS)
      for (const density of DENSITIES)
        for (const uiScale of UI_SCALES) {
          const prefs = {
            theme,
            density,
            uiScale,
            showGettingStartedTips: false,
            showSelectionToolbar: false
          }
          saveAppearancePrefs(st, prefs)
          expect(loadAppearancePrefs(st)).toEqual(prefs)
          appearanceAttributes(prefs, true)
        }
    expect(JSON.stringify(s().project)).toBe(before.json)
    expect(selectIsDirty(s())).toBe(before.dirty)
    expect(selectCanUndo(s())).toBe(before.undo)
    expect(selectCanRedo(s())).toBe(before.redo)
    expect(s().history).toBe(before.history)
    expect(ports.calls.length).toBe(before.calls)
    // The editor store has no appearance state at all: it lives in the renderer's own app-level store.
    for (const k of ['theme', 'density', 'uiScale', 'showGettingStartedTips'])
      expect(Object.keys(s())).not.toContain(k)
  })
})
