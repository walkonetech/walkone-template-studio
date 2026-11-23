import { dialogReturnTarget, nativePickerReturnsFocus } from '@editor/layout'

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

/**
 * Where a command that shows a NATIVE file picker should hand focus back if the picker is cancelled (B6.1): the menu
 * title when it ran from a menu (the item is gone once the menu closes), otherwise the control that ran it (the Start
 * screen's Open… card). Read synchronously when the command starts, before anything closes.
 */
export const commandOrigin = (active: Element | null): HTMLElement | null => dialogOpener(active)

const focusOnPage = (): boolean =>
  document.activeElement === null || document.activeElement === document.body

/**
 * Called when a native picker's command has finished. The picker is its own OS window, so the app window may get
 * focus back slightly AFTER the IPC answer arrives (Windows); wait for that one `focus` event, then one frame so the
 * browser's own focus bookkeeping has run, and only then restore — and only if focus is still on the page.
 */
export async function afterNativePicker(
  origin: HTMLElement | null,
  outcome: 'ok' | 'cancelled' | 'error'
): Promise<void> {
  if (!origin || outcome === 'ok') return
  if (!document.hasFocus())
    await new Promise<void>((resolve) =>
      window.addEventListener('focus', () => resolve(), { once: true })
    )
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  if (nativePickerReturnsFocus({ outcome, focusOnPage: focusOnPage() })) restoreFocus(origin)
}
