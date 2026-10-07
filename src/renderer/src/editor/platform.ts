/** Platform conventions for modifier keys: Command on macOS, Control elsewhere. */
export const isMac = (): boolean =>
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** True when the platform's primary shortcut modifier is held. */
export const isPrimaryModifier = (e: { metaKey: boolean; ctrlKey: boolean }): boolean =>
  isMac() ? e.metaKey : e.ctrlKey

export const primaryModifierLabel = (): string => (isMac() ? '⌘' : 'Ctrl+')
