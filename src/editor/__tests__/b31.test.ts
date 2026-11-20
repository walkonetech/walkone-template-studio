import { describe, expect, it } from 'vitest'
import {
  CANVAS_STATE_CONTROLS,
  controlOwnsKey,
  drawerOpenAfterModeChange,
  escapeTarget,
  parseLayoutPrefs
} from '../layout'
import { COMMANDS, MENUS } from '../commands'
import { TIPS } from '../tooltips'
import { TOOLS } from '../tools'
import { exportOutputs, packageFiles } from '../exportPlan'
import { PhotoLayerSchema, createProject } from '@domain'
import { T0, photo } from './helpers'

describe('B3.1 Escape after resizing the floating drawer', () => {
  it('the resize grip (separator) keeps arrows but lets Escape through to the window', () => {
    const grip = { role: 'separator' as const, textEntry: false }
    expect(controlOwnsKey(grip, 'ArrowLeft')).toBe(true)
    expect(controlOwnsKey(grip, 'ArrowRight')).toBe(true)
    expect(controlOwnsKey(grip, 'Escape')).toBe(false)
    // …and the window's order then closes the floating drawer first.
    expect(escapeTarget({ popoverOpen: false, floatingDrawerOpen: true, hasSelection: true })).toBe(
      'floating-drawer'
    )
  })
  it('radio groups behave like the grip; menus, dialogs and text fields keep Escape', () => {
    expect(controlOwnsKey({ role: 'radiogroup', textEntry: false }, 'Escape')).toBe(false)
    expect(controlOwnsKey({ role: 'radiogroup', textEntry: false }, 'ArrowRight')).toBe(true)
    expect(controlOwnsKey({ role: 'menu', textEntry: false }, 'Escape')).toBe(true)
    expect(controlOwnsKey({ role: 'dialog', textEntry: false }, 'Escape')).toBe(true)
    expect(controlOwnsKey({ role: null, textEntry: true }, 'Escape')).toBe(true)
    expect(controlOwnsKey({ role: null, textEntry: false }, 'Escape')).toBe(false)
  })
})

describe('B3.1 entering Print Preview closes the creation drawer', () => {
  it('Design → Print Preview closes an open drawer (floating or docked)', () => {
    expect(drawerOpenAfterModeChange('design', 'preview', true)).toBe(false)
    expect(drawerOpenAfterModeChange('design', 'preview', false)).toBe(false)
  })
  it('Print Preview → Design never reopens it by itself; staying in a mode changes nothing', () => {
    expect(drawerOpenAfterModeChange('preview', 'design', false)).toBe(false)
    expect(drawerOpenAfterModeChange('design', 'design', true)).toBe(true)
    expect(drawerOpenAfterModeChange('preview', 'preview', false)).toBe(false)
  })
})

describe('B3.1 Sample Photos removed (owner decision)', () => {
  it('no command, menu item, tooltip or rail text offers sample photos, shuffle or reposition', () => {
    const text = JSON.stringify({ COMMANDS, MENUS, TIPS, TOOLS })
    expect(text).not.toMatch(/sample photo|shuffle|reset samples|choose photo|reposition photo/i)
    expect([...CANVAS_STATE_CONTROLS]).toEqual(['mode', 'safeAreas', 'overflow'])
  })
  it('the Photos rail category is about photo slots only', () => {
    expect(TOOLS.find((t) => t.id === 'photos')!.hint).toMatch(/photo slots/i)
  })
  it('older projects that carry the dormant sampleAssetId still parse unchanged (no schema change, no migration)', () => {
    const old = { ...photo('p1', 1), sampleAssetId: 'asset-1' }
    const parsed = PhotoLayerSchema.safeParse(old)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.sampleAssetId).toBe('asset-1')
  })
  it('an obsolete layout preference is ignored safely', () => {
    expect(parseLayoutPrefs({ samplePhotos: true, drawerWidth: 300 })).toMatchObject({
      drawerWidth: 300
    })
    expect(parseLayoutPrefs({ samplePhotos: true })).not.toHaveProperty('samplePhotos')
  })
  it('the Proof PNG describes numbered placeholders, never sample photos', () => {
    const p = createProject({ name: 'P', design: 'strip-2x6-600', now: T0, createId: () => 'p' })
    const proof = exportOutputs(p).find((o) => o.kind === 'proof')!
    expect(proof.production).toBe(false)
    expect(proof.description).toMatch(/numbered placeholder/i)
    expect(proof.description).not.toMatch(/sample/i)
    const files = packageFiles({
      background: [],
      photos: [],
      frames: [],
      overlay: [],
      text: [],
      notes: []
    })
    expect(JSON.stringify(files)).not.toMatch(/sample/i)
  })
})
