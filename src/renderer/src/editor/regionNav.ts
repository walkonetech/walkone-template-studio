import { REGION_ORDER, nextRegion, type RegionId } from '@editor/layout'

const FOCUSABLE =
  'button:not(:disabled):not([tabindex="-1"]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

const regionEl = (id: RegionId): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-region="${id}"]`)

const visible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/**
 * F6 / Shift+F6 (7A): move focus to the next landmark in the fixed order top bar → rail → open drawer → canvas-state
 * bar → canvas → Properties/Layers → status bar, skipping regions that are not on screen. Focus lands on the region's
 * first focusable control (the canvas region itself takes focus, so arrow keys then nudge the selection).
 */
export function cycleRegion(backwards: boolean): RegionId | null {
  const available = REGION_ORDER.filter((id) => {
    const el = regionEl(id)
    return el !== null && visible(el)
  })
  const active = document.activeElement
  const current =
    available.find((id) => {
      const el = regionEl(id)
      return el !== null && active instanceof Node && el.contains(active)
    }) ?? null
  // From inside the floating drawer (which sits in the canvas region), the drawer is the current region.
  const next = nextRegion(current, available, backwards)
  if (!next) return null
  const el = regionEl(next)
  if (!el) return null
  const target =
    next === 'canvas' ? el : ([...el.querySelectorAll<HTMLElement>(FOCUSABLE)].find(visible) ?? el)
  if (target === el && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  target.focus()
  return next
}
