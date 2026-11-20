import { describe, expect, it } from 'vitest'
import { isRestoringFocus, restoreFocus } from '../restoreFocus'

/** A stand-in element: records whether the focus it received was marked as a restoration. */
const fakeEl = (connected = true) => {
  const el = {
    isConnected: connected,
    focused: 0,
    sawRestoring: [] as boolean[],
    focus() {
      el.focused++
      el.sawRestoring.push(isRestoringFocus(el as unknown as EventTarget))
    }
  }
  return el as typeof el & HTMLElement
}

describe('B3.1 focus restoration does not pop the trigger tooltip', () => {
  it('focus handed back by a closing dialog/popover/menu is marked as a restoration while it happens', () => {
    const exportButton = fakeEl()
    restoreFocus(exportButton)
    expect(exportButton.focused).toBe(1)
    expect(exportButton.sawRestoring).toEqual([true])
  })
  it('the mark ends with the restoration: a later ordinary focus (Tab) is not marked, so its tooltip shows', () => {
    const exportButton = fakeEl()
    restoreFocus(exportButton)
    exportButton.focus()
    expect(exportButton.sawRestoring).toEqual([true, false])
    expect(isRestoringFocus(exportButton)).toBe(false)
  })
  it('only the restored element is marked; a missing or detached element is ignored', () => {
    const a = fakeEl()
    const b = fakeEl()
    restoreFocus(a)
    b.focus()
    expect(b.sawRestoring).toEqual([false])
    const gone = fakeEl(false)
    restoreFocus(gone)
    restoreFocus(null)
    expect(gone.focused).toBe(0)
  })
  it('the mark is cleared even if focusing throws', () => {
    const bad = {
      isConnected: true,
      focus: () => {
        throw new Error('x')
      }
    } as unknown as HTMLElement
    expect(() => restoreFocus(bad)).toThrow()
    expect(isRestoringFocus(bad)).toBe(false)
  })
})
