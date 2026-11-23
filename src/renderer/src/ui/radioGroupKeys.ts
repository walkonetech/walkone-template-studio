import type React from 'react'

/**
 * Arrow keys in a radio group (B6, WAI-ARIA radio group pattern): ←/↑ and →/↓ move to the previous / next enabled
 * radio of THIS group (wrapping), focus it and choose it (selection follows focus). Home/End go to the first/last.
 * Shared by every `role="radiogroup"` built from buttons, so all of them behave the same.
 */
export function onRadioGroupKeyDown(e: React.KeyboardEvent<HTMLElement>): void {
  const d =
    e.key === 'ArrowRight' || e.key === 'ArrowDown'
      ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
        ? -1
        : e.key === 'Home' || e.key === 'End'
          ? 0
          : null
  if (d === null || e.altKey || e.ctrlKey || e.metaKey) return
  const group = e.currentTarget
  const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')].filter(
    (r) =>
      r.closest('[role="radiogroup"]') === group &&
      !(r as HTMLButtonElement).disabled &&
      r.getAttribute('aria-disabled') !== 'true'
  )
  if (radios.length === 0) return
  const focused = radios.indexOf(document.activeElement as HTMLElement)
  const checked = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true')
  const from = focused >= 0 ? focused : checked >= 0 ? checked : 0
  const to =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? radios.length - 1
        : (from + (d as number) + radios.length) % radios.length
  const next = radios[to]
  if (!next) return
  e.preventDefault()
  e.stopPropagation()
  next.focus()
  if (next.getAttribute('aria-checked') !== 'true') next.click()
}
