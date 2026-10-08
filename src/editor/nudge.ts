/** Arrow-key nudging is defined in DESIGN pixels, so it never depends on the zoom level or the view. */
export const NUDGE_PX = 1
export const NUDGE_SHIFT_PX = 10

export function nudgeDelta(key: string, shift: boolean): { dx: number; dy: number } | null {
  const step = shift ? NUDGE_SHIFT_PX : NUDGE_PX
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 }
    case 'ArrowRight':
      return { dx: step, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -step }
    case 'ArrowDown':
      return { dx: 0, dy: step }
    default:
      return null
  }
}
