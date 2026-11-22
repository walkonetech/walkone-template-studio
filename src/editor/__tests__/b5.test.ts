import { describe, expect, it } from 'vitest'
import type { Layer, TemplateProject } from '@domain'
import {
  ROTATE_HANDLE_ROOM,
  TOOLBAR_LABELS,
  colorTarget,
  currentColor,
  placeToolbar,
  toScreenRect,
  toolbarActions,
  toolbarKind,
  toolbarVisible
} from '../selectionToolbar'
import {
  ESSENTIALS,
  SECTION_DEFAULT_OPEN,
  TEXT_STYLE_OPTIONS,
  appearanceSummary,
  frameSummary,
  layerSummary,
  positionSummary,
  propertiesHeader,
  shapeSummary,
  sharedValue,
  spacingSummary,
  textStyleFromValue,
  textStyleValue
} from '../propertiesModel'
import { TIPS_FOOTER, tipSteps, tipsVisible } from '../firstRun'
import { DEFAULT_TEXT_FONT, createNewLayer } from '../newLayers'
import { DEFAULT_APPEARANCE, parseAppearancePrefs } from '../appearance'
import { filterRecents, isStripFormat } from '../welcome'
import { COMMANDS, MENUS, commandForKey } from '../commands'
import { fontStatus } from '../fonts'
import { group, makeProject, photo, shape, text } from './helpers'

/** Phase 7B B5: selection toolbar, Properties structure, tips, default font, Settings preferences, recents. */

const words = (k: Parameters<typeof toolbarActions>[0]): string[] =>
  toolbarActions(k).map((a) => TOOLBAR_LABELS[a])

describe('selection toolbar: actions by selection type (B1 03/04 + §0a/§0c)', () => {
  it('text: Edit text · Colors · Arrange · Duplicate · More', () => {
    expect(words('text')).toEqual(['Edit text', 'Colors', 'Arrange', 'Duplicate', 'More'])
  })
  it('photo slot: Photo number · Frame · Arrange · Duplicate · More (no Reposition)', () => {
    expect(words('photo')).toEqual(['Photo number', 'Frame', 'Arrange', 'Duplicate', 'More'])
    expect(toolbarActions('photo').join()).not.toMatch(/reposition|sample/i)
  })
  it('image, shape, line, group and several layers', () => {
    expect(words('image')).toEqual(['Replace image…', 'Arrange', 'Duplicate', 'More'])
    expect(words('shape')).toEqual(['Colors', 'Arrange', 'Duplicate', 'More'])
    expect(words('line')).toEqual(['Colors', 'Arrange', 'Duplicate', 'More'])
    expect(words('group')).toEqual(['Ungroup', 'Arrange', 'Duplicate', 'More'])
    expect(words('multi')).toEqual(['Align', 'Group', 'Arrange', 'Duplicate', 'More'])
  })
  it('every set has 3–5 actions, keeps Duplicate and ends with More', () => {
    for (const k of ['text', 'photo', 'image', 'shape', 'line', 'group', 'multi'] as const) {
      const a = toolbarActions(k)
      expect(a.length).toBeGreaterThanOrEqual(3)
      expect(a.length).toBeLessThanOrEqual(5)
      expect(a).toContain('duplicate')
      expect(a[a.length - 1]).toBe('more')
    }
  })
  it('the kind follows the selection', () => {
    expect(toolbarKind([])).toBeNull()
    expect(toolbarKind([text('t', 1)])).toBe('text')
    expect(toolbarKind([photo('p', 1)])).toBe('photo')
    expect(toolbarKind([shape('s', 1, { shape: 'line' } as Partial<Layer>)])).toBe('line')
    expect(toolbarKind([group('g', 1)])).toBe('group')
    expect(toolbarKind([text('t', 1), photo('p', 1)])).toBe('multi')
  })
  it('palette dots edit the layer’s real colour property', () => {
    expect(colorTarget(text('t', 1))).toBe('fill')
    expect(colorTarget(shape('s', 1))).toBe('fill')
    expect(
      colorTarget(
        shape('s', 1, {
          fill: null,
          stroke: { color: { kind: 'literal', value: '#000000' }, width: 2 }
        } as Partial<Layer>)
      )
    ).toBe('stroke')
    expect(colorTarget(photo('p', 1))).toBeNull()
    const linked = text('t', 1, {
      fill: { kind: 'palette', paletteColorId: 'gold' }
    } as Partial<Layer>)
    expect(currentColor(linked, 'fill')).toEqual({ kind: 'palette', paletteColorId: 'gold' })
  })
})

describe('selection toolbar: when it shows', () => {
  const p = makeProject([text('t', 1), shape('locked', 2, { locked: true })])
  const base = {
    enabled: true,
    viewMode: 'design' as const,
    editingText: false,
    interacting: false,
    project: p,
    selectedIds: ['t']
  }
  it('shows for an editable selection in Design', () => {
    expect(toolbarVisible(base)).toBe(true)
  })
  it('hides with no selection, in Print Preview, while editing text or dragging, for a locked layer, or when turned off', () => {
    expect(toolbarVisible({ ...base, selectedIds: [] })).toBe(false)
    expect(toolbarVisible({ ...base, viewMode: 'preview' })).toBe(false)
    expect(toolbarVisible({ ...base, editingText: true })).toBe(false)
    expect(toolbarVisible({ ...base, interacting: true })).toBe(false)
    expect(toolbarVisible({ ...base, selectedIds: ['locked'] })).toBe(false)
    expect(toolbarVisible({ ...base, enabled: false })).toBe(false)
  })
})

describe('selection toolbar: placement stays inside the canvas area', () => {
  const host = { width: 1054, height: 671 }
  const size = { width: 420, height: 40 }
  it('goes above the selection, clear of the rotate handle', () => {
    const sel = { left: 400, top: 300, width: 200, height: 100 }
    const p = placeToolbar({ selection: sel, size, host })
    expect(p.side).toBe('top')
    expect(p.top + size.height).toBeLessThanOrEqual(sel.top - ROTATE_HANDLE_ROOM)
  })
  it('falls back below when the selection touches the top, and is clamped inside every edge', () => {
    const p = placeToolbar({
      selection: { left: 900, top: 5, width: 300, height: 100 },
      size,
      host
    })
    expect(p.side).toBe('bottom')
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.left + size.width).toBeLessThanOrEqual(host.width - 8)
    expect(p.top + size.height).toBeLessThanOrEqual(host.height - 8)
  })
  it('a selection bigger than the canvas area still gets a contained toolbar', () => {
    const p = placeToolbar({
      selection: { left: -500, top: -500, width: 3000, height: 3000 },
      size,
      host
    })
    expect(p.left).toBeGreaterThanOrEqual(0)
    expect(p.top).toBeGreaterThanOrEqual(0)
    expect(p.left + size.width).toBeLessThanOrEqual(host.width)
    expect(p.top + size.height).toBeLessThanOrEqual(host.height)
  })
  it('design bounds map through zoom and pan', () => {
    expect(
      toScreenRect(
        { x: 100, y: 200, width: 1000, height: 500 },
        { scale: 0.2, offsetX: 50, offsetY: 10 }
      )
    ).toEqual({
      left: 70,
      top: 50,
      width: 200,
      height: 100
    })
  })
})

describe('Properties: Essentials, sections and summaries (B1 03/04)', () => {
  it('Essentials per layer type', () => {
    expect(ESSENTIALS.text).toEqual(['Content', 'Font', 'Style', 'Size', 'Color', 'Align'])
    expect(ESSENTIALS.photo).toEqual(['Photo number', 'Fit', 'Frame', 'Corner radius'])
    expect(ESSENTIALS.multi).toContain('Align and distribute')
  })
  it('secondary sections start closed', () => {
    expect(Object.values(SECTION_DEFAULT_OPEN).every((v) => v === false)).toBe(true)
  })
  it('summaries read the values', () => {
    const t = text('t', 1, {
      x: 120,
      y: 2700,
      width: 960,
      height: 270,
      lineHeight: 1.1
    } as Partial<Layer>) as Extract<Layer, { type: 'text' }>
    expect(positionSummary(t)).toBe('X 120 · Y 2700 · 960 × 270')
    expect(positionSummary({ ...t, rotation: 3 })).toBe('X 120 · Y 2700 · 960 × 270 · 3°')
    expect(spacingSummary(t)).toBe('Line 1.1 · Letter 0')
    expect(appearanceSummary({ opacity: 0.5 })).toBe('Opacity 50 %')
    expect(frameSummary(photo('p', 2) as Extract<Layer, { type: 'photo' }>)).toBe('Solid · 12 px')
    expect(
      frameSummary(
        photo('p', 2, { frame: { style: 'none' } } as Partial<Layer>) as Extract<
          Layer,
          { type: 'photo' }
        >
      )
    ).toBe('No frame')
    expect(shapeSummary(shape('s', 1) as Extract<Layer, { type: 'shape' }>)).toBe('Fill only')
    expect(layerSummary({ visible: false, locked: true })).toBe('Hidden · Locked')
  })
  it('header: name and what it is; several layers by kind', () => {
    const all = [
      group('Title block', 1),
      text('Names', 2, { parentId: 'Title block' } as Partial<Layer>),
      photo('p2', 2)
    ]
    expect(propertiesHeader([all[1]!], all)).toEqual({
      title: 'Names',
      subtitle: 'Text · in Title block'
    })
    expect(propertiesHeader([all[2]!], all)).toEqual({
      title: 'Photo 2',
      subtitle: 'Photo slot #2'
    })
    expect(propertiesHeader([text('a', 1), text('b', 2), shape('c', 3)], all)).toEqual({
      title: '3 layers selected',
      subtitle: '2 texts · 1 shape'
    })
  })
  it('several layers never show a misleading single value', () => {
    expect(sharedValue([text('a', 1), text('b', 2)], (l) => l.opacity)).toBe(1)
    expect(sharedValue([text('a', 1), text('b', 2, { opacity: 0.4 })], (l) => l.opacity)).toBe(
      'mixed'
    )
  })
  it('Style combines weight and italic, and round-trips', () => {
    expect(TEXT_STYLE_OPTIONS).toHaveLength(18)
    expect(textStyleValue({ fontWeight: 400, fontStyle: 'normal' })).toBe('400-normal')
    expect(TEXT_STYLE_OPTIONS.find((o) => o.value === '700-italic')?.label).toBe('Bold Italic')
    expect(TEXT_STYLE_OPTIONS.find((o) => o.value === '400-italic')?.label).toBe('Italic')
    expect(textStyleFromValue('700-italic')).toEqual({ fontWeight: 700, fontStyle: 'italic' })
    expect(textStyleValue({ fontWeight: 650, fontStyle: 'normal' })).toBe('700-normal')
  })
})

describe('getting-started tips (B1 02b, R3)', () => {
  const base = {
    pref: true,
    origin: 'new-blank' as const,
    closedForThisProject: false,
    viewMode: 'design' as const
  }
  it('show on a new blank project only', () => {
    expect(tipsVisible(base)).toBe(true)
    for (const origin of ['opened', 'imported', 'recovered', 'sample', null] as const)
      expect(tipsVisible({ ...base, origin })).toBe(false)
  })
  it('hidden by the preference, by closing them for this project, and in Print Preview', () => {
    expect(tipsVisible({ ...base, pref: false })).toBe(false)
    expect(tipsVisible({ ...base, closedForThisProject: true })).toBe(false)
    expect(tipsVisible({ ...base, viewMode: 'preview' })).toBe(false)
  })
  it('three steps that tick themselves off; reading them changes nothing', () => {
    const empty = makeProject([], 'strip-2x6-600')
    const before = JSON.stringify(empty)
    expect(tipSteps(empty).map((s) => [s.id, s.done])).toEqual([
      ['photo', false],
      ['text', false],
      ['colors', false]
    ])
    expect(JSON.stringify(empty)).toBe(before)
    const filled: TemplateProject = {
      ...empty,
      layers: [photo('p', 1), text('t', 2)],
      palette: { colors: [{ id: 'gold', role: 'accent', name: 'Gold', value: '#b39b74' }] }
    }
    expect(tipSteps(filled).every((s) => s.done)).toBe(true)
    expect(TIPS_FOOTER).toMatch(/See how it prints/)
    expect(TIPS_FOOTER).toMatch(/Checks/)
  })
})

describe('default font for NEW text (B5 policy)', () => {
  it('new text asks for Arial (installed on macOS and Windows)', () => {
    expect(DEFAULT_TEXT_FONT).toBe('Arial')
    const t = createNewLayer(makeProject(), 'text')
    expect(t.type === 'text' && t.fontFamily).toBe('Arial')
  })
  it('is not missing on either platform’s standard font list', () => {
    for (const families of [
      ['Arial', 'Helvetica', 'Times New Roman'],
      ['Arial', 'Calibri', 'Segoe UI']
    ])
      expect(
        fontStatus(DEFAULT_TEXT_FONT, { catalog: { status: 'ready', families } }).availability
      ).toBe('available')
  })
  it('existing text keeps the family it stores', () => {
    const p = makeProject([text('t', 1, { fontFamily: 'Helvetica' } as Partial<Layer>)])
    const added = createNewLayer(p, 'text')
    expect((p.layers[0] as Extract<Layer, { type: 'text' }>).fontFamily).toBe('Helvetica')
    expect(added.type === 'text' && added.fontFamily).toBe('Arial')
  })
})

describe('Settings preferences (this computer only)', () => {
  it('the selection toolbar switch defaults on and parses safely', () => {
    expect(DEFAULT_APPEARANCE.showSelectionToolbar).toBe(true)
    expect(parseAppearancePrefs({}).showSelectionToolbar).toBe(true)
    expect(parseAppearancePrefs({ showSelectionToolbar: false }).showSelectionToolbar).toBe(false)
    expect(parseAppearancePrefs({ showSelectionToolbar: 'no' }).showSelectionToolbar).toBe(true)
  })
  it('File › Settings… with Ctrl/⌘+, and no project needed', () => {
    expect(COMMANDS['app.settings'].label).toBe('Settings…')
    expect(COMMANDS['app.settings'].needsProject).toBeFalsy()
    expect(MENUS.find((m) => m.id === 'file')?.items).toContain('app.settings')
    expect(commandForKey({ key: ',', shiftKey: false }, true)).toBe('app.settings')
  })
})

describe('Start: recent projects', () => {
  it('search filters by name', () => {
    const items = [{ name: 'Ava & Theo Wedding' }, { name: 'Spring Gala' }]
    expect(filterRecents(items, 'gala')).toEqual([{ name: 'Spring Gala' }])
    expect(filterRecents(items, '  ')).toHaveLength(2)
  })
  it('a 2×6 strip is drawn as its two copies', () => {
    expect(isStripFormat({ width: 2, height: 6 })).toBe(true)
    expect(isStripFormat({ width: 4, height: 6 })).toBe(false)
    expect(isStripFormat(undefined)).toBe(false)
  })
})
