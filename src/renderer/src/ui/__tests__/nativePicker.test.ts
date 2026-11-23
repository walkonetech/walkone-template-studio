import { afterEach, describe, expect, it, vi } from 'vitest'
import { nativePickerReturnsFocus } from '@editor/layout'
import { afterNativePicker, isRestoringFocus } from '../restoreFocus'

/**
 * Phase 7B B6.1: File › Open… and File › Import dslrBooth template… show a NATIVE picker. Cancelling it left focus on
 * the page body (the menu item that ran the command had gone). Focus now returns to the command's origin (the File
 * title) — but never after a successful open/import, and never over a control the user moved to.
 */
const fakeEl = () => {
  const el = {
    isConnected: true,
    focused: 0,
    sawRestoring: [] as boolean[],
    focus() {
      el.focused++
      el.sawRestoring.push(isRestoringFocus(el as unknown as EventTarget))
      ;(globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement =
        el
    }
  }
  return el as typeof el & HTMLElement
}

/** A minimal page: `document` with body/activeElement/hasFocus, `window` focus events, rAF. */
const page = (hasFocus: boolean) => {
  const body = { tag: 'body' }
  const listeners: (() => void)[] = []
  const doc = { body, activeElement: body as unknown, hasFocus: () => hasFocus }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', {
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'focus') listeners.push(fn)
    }
  })
  vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0))
  return {
    doc,
    /** The OS gives the app window focus back (the picker closed). */
    windowFocused: () => {
      hasFocus = true
      listeners.splice(0).forEach((f) => f())
    }
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('B6.1 native picker focus rule', () => {
  it('returns focus only when the command did not go on (cancelled / error) and focus is stranded on the page', () => {
    expect(nativePickerReturnsFocus({ outcome: 'cancelled', focusOnPage: true })).toBe(true)
    expect(nativePickerReturnsFocus({ outcome: 'error', focusOnPage: true })).toBe(true)
    expect(nativePickerReturnsFocus({ outcome: 'ok', focusOnPage: true })).toBe(false)
    expect(nativePickerReturnsFocus({ outcome: 'cancelled', focusOnPage: false })).toBe(false)
  })
})

describe('B6.1 afterNativePicker', () => {
  it('Open/Import cancelled: focus goes back to the File title, marked as a restoration (no tooltip)', async () => {
    page(true)
    const file = fakeEl()
    await afterNativePicker(file, 'cancelled')
    expect(file.focused).toBe(1)
    expect(file.sawRestoring).toEqual([true])
  })
  it('waits for the app window to get focus back from the native picker before restoring (Windows order)', async () => {
    const p = page(false)
    const file = fakeEl()
    const done = afterNativePicker(file, 'cancelled')
    await new Promise((r) => setTimeout(r, 5))
    expect(file.focused).toBe(0)
    p.windowFocused()
    await done
    expect(file.focused).toBe(1)
  })
  it('a successful Open/Import is never pulled back to File', async () => {
    page(true)
    const file = fakeEl()
    await afterNativePicker(file, 'ok')
    expect(file.focused).toBe(0)
  })
  it('a control the user (or the next screen) already focused keeps focus', async () => {
    const p = page(true)
    p.doc.activeElement = { tag: 'button' }
    const file = fakeEl()
    await afterNativePicker(file, 'cancelled')
    expect(file.focused).toBe(0)
  })
  it('no origin (e.g. Ctrl+O with nothing focused): nothing is forced', async () => {
    page(true)
    await expect(afterNativePicker(null, 'cancelled')).resolves.toBeUndefined()
  })
})
