import { useRef } from 'react'

/**
 * Draggable/keyboard separator (role=separator, focusable). The parent owns the value; this only reports changes in
 * pixels along its axis. Arrow keys move it by 16 px (Shift: 64). It never touches project state.
 */
export function Splitter({
  orientation,
  label,
  value,
  min,
  max,
  onChange,
  invert = false
}: {
  /** 'vertical' = a vertical bar between side-by-side panes (resizes width); 'horizontal' = a bar between stacked panes. */
  orientation: 'vertical' | 'horizontal'
  label: string
  value: number
  min: number
  max: number
  /** Receives the new absolute value (unclamped); the caller clamps. */
  onChange: (next: number) => void
  /** For a pane on the far side of the bar (right/bottom pane), dragging toward the start GROWS it. */
  invert?: boolean
}): React.JSX.Element {
  const drag = useRef<{ start: number; initial: number } | null>(null)
  const vertical = orientation === 'vertical'
  const sign = invert ? -1 : 1
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`splitter ${vertical ? 'v' : 'h'}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { start: vertical ? e.clientX : e.clientY, initial: value }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const delta = (vertical ? e.clientX : e.clientY) - d.start
        onChange(d.initial + sign * delta)
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16
        const dec = vertical ? 'ArrowLeft' : 'ArrowUp'
        const inc = vertical ? 'ArrowRight' : 'ArrowDown'
        if (e.key === dec) {
          e.preventDefault()
          onChange(value - sign * step)
        } else if (e.key === inc) {
          e.preventDefault()
          onChange(value + sign * step)
        }
      }}
    />
  )
}
