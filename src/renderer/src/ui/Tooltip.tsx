import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover/focus tooltip for icon-only controls. It only ever repeats what the control's accessible name already says
 * (plus the shortcut), so nothing essential lives in it. Portalled and fixed so panels with overflow never clip it.
 */
export function Tooltip({
  label,
  shortcut,
  placement = 'bottom',
  children
}: {
  label: string
  shortcut?: string
  placement?: 'bottom' | 'right' | 'top'
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const show = (): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      setPos(
        placement === 'right'
          ? { x: r.right + 8, y: r.top + r.height / 2 }
          : placement === 'top'
            ? { x: r.left + r.width / 2, y: r.top - 8 }
            : { x: r.left + r.width / 2, y: r.bottom + 8 }
      )
    }, 450)
  }
  const hide = (): void => {
    clearTimeout(timer.current)
    setPos(null)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const transform =
    placement === 'right'
      ? 'translateY(-50%)'
      : placement === 'top'
        ? 'translate(-50%, -100%)'
        : 'translateX(-50%)'
  return (
    <span
      ref={ref}
      className="ui-tipwrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div role="tooltip" className="ui-tip" style={{ left: pos.x, top: pos.y, transform }}>
            {label}
            {shortcut && <kbd>{shortcut}</kbd>}
          </div>,
          document.body
        )}
    </span>
  )
}
