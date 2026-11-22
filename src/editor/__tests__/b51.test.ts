import { describe, expect, it } from 'vitest'
import { MENU_OPENER_FRESH_MS, dialogReturnTarget } from '../layout'

/** Phase 7B B5.1: where a dialog hands focus back (File › Settings… → the File menu button). */

describe('dialog focus return (File › Settings…)', () => {
  it('keeps the control that opened the dialog when it is still usable (Ctrl+, from the canvas, a button)', () => {
    expect(dialogReturnTarget({ activeUsable: true, menuOpenerAgeMs: null })).toBe('active')
    expect(dialogReturnTarget({ activeUsable: true, menuOpenerAgeMs: 5 })).toBe('active')
  })
  it('uses the menu trigger when the dialog was opened from a menu item that has gone', () => {
    expect(dialogReturnTarget({ activeUsable: false, menuOpenerAgeMs: 0 })).toBe('menu-trigger')
    expect(dialogReturnTarget({ activeUsable: false, menuOpenerAgeMs: MENU_OPENER_FRESH_MS })).toBe(
      'menu-trigger'
    )
  })
  it('ignores a stale or missing menu note (no focus steering from an old menu choice)', () => {
    expect(
      dialogReturnTarget({ activeUsable: false, menuOpenerAgeMs: MENU_OPENER_FRESH_MS + 1 })
    ).toBe('none')
    expect(dialogReturnTarget({ activeUsable: false, menuOpenerAgeMs: null })).toBe('none')
  })
})
