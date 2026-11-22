import { dialogReturnTarget } from '@editor/layout'

/**
 * Programmatic focus RESTORATION (a dialog, popover or menu handing focus back to the control that opened it). Focus
 * tooltips use `isRestoringFocus` to stay closed for that one focus: the user did not move focus there, so a
 * tooltip popping up (and lingering after the mouse has left) would be noise. Tabbing to the control afterwards, or
 * hovering it, still shows its tooltip as usual.
 */
let restoring: EventTarget | null = null

export function restoreFocus(el: HTMLElement | null | undefined): void {
  if (!el || !el.isConnected) return
  restoring = el
  try {
    // Focus events fire synchronously inside focus(), so the tooltip sees the flag.
    el.focus()
  } finally {
    restoring = null
  }
}

/**
 * A menu item that opens a dialog unmounts as the menu closes, so the dialog cannot hand focus back to it. The menu
 * notes its trigger here just before running the item; a dialog opening right after uses it as its opener (B5.1).
 */
let menuOpener: { el: HTMLElement; at: number } | null = null

export function noteMenuOpener(el: HTMLElement): void {
  menuOpener = { el, at: performance.now() }
}

/** The element a dialog opening now should return focus to when it closes (see `dialogReturnTarget`). */
export function dialogOpener(active: Element | null): HTMLElement | null {
  const note = menuOpener
  menuOpener = null
  const usable =
    active instanceof HTMLElement &&
    active.isConnected &&
    active !== document.body &&
    !active.closest('[role=menu]')
  const choice = dialogReturnTarget({
    activeUsable: usable,
    menuOpenerAgeMs: note && note.el.isConnected ? performance.now() - note.at : null
  })
  return choice === 'active' ? (active as HTMLElement) : choice === 'menu-trigger' ? note!.el : null
}

export const isRestoringFocus = (target: EventTarget | null): boolean =>
  restoring !== null && restoring === target
