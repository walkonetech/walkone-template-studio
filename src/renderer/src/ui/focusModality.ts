/**
 * How the current focus arrived: from the keyboard (Tab, F6, shortcuts, a dialog handing focus back after Escape…)
 * or from a pointer press. B6: `:focus-visible` cannot answer this at key time — Chromium starts matching it on the
 * focused element as soon as ANY key is pressed, Space included — so Space-to-pan reads this instead.
 * Programmatic focus counts as whatever the user did last.
 */
let lastInput: 'keyboard' | 'pointer' = 'pointer'
let focusedBy: 'keyboard' | 'pointer' = 'pointer'

if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      // A modifier on its own is still the keyboard (e.g. Shift before Tab).
      if (!e.repeat) lastInput = 'keyboard'
    },
    true
  )
  window.addEventListener(
    'pointerdown',
    () => {
      lastInput = 'pointer'
    },
    true
  )
  window.addEventListener(
    'focusin',
    () => {
      focusedBy = lastInput
    },
    true
  )
}

/** true when the element that has focus now got it from the keyboard. */
export const focusArrivedByKeyboard = (): boolean => focusedBy === 'keyboard'
