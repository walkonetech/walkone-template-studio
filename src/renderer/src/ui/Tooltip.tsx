import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Hover/focus tooltip for icon-only controls: the shared tooltip (HTML `title` is only a fallback during migration).
 * It only ever repeats what the control's accessible name already says (plus the shortcut and a one-line hint), so
 * nothing essential lives in it. Portalled and fixed so panels with overflow never clip it. `media` makes it a
 * picture tooltip (a small drawing above the text, B1); the picture is decorative and hidden from screen readers.
 */
export function Tooltip({
  label,
  hint,
  shortcut,
  placement = 'bottom',
  media,
  children
}: {
  label: string
  /** One short sentence about what the control does (the label alone only names it). */
  hint?: string
  shortcut?: string
  placement?: 'bottom' | 'right' | 'top'
  /** A small illustration shown above the text (picture tooltip). */
  media?: React.ReactNode
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
          <div
            role="tooltip"
            className={`ui-tip${media ? ' rich' : ''}`}
            style={{ left: pos.x, top: pos.y, transform }}
          >
            {media && (
              <span className="ui-tip-media" aria-hidden="true">
                {media}
              </span>
            )}
            <span className="ui-tip-title">
              {label}
              {shortcut && <kbd>{shortcut}</kbd>}
            </span>
            {hint && <span className="ui-tip-hint">{hint}</span>}
          </div>,
          document.body
        )}
    </span>
  )
}
