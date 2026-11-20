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

export const isRestoringFocus = (target: EventTarget | null): boolean =>
  restoring !== null && restoring === target
