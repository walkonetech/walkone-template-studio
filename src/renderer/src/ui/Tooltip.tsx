import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeFloating, type Side } from '@editor/floatingPlacement'

/**
 * Hover/focus tooltip for icon-only controls: the shared tooltip (HTML `title` is only a fallback during migration).
 * It only ever repeats what the control's accessible name already says (plus the shortcut and a one-line hint), so
 * nothing essential lives in it. Portalled and fixed so panels with overflow never clip it. `media` makes it a
 * picture tooltip (a small drawing above the text, B1); the picture is decorative and hidden from screen readers.
 * Placement is viewport-aware (`placeFloating`): the tooltip is measured first (invisible), then put on the preferred
 * side, flipped or shifted so it always stays fully inside the window with an 8 px margin; long text wraps.
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
  /** Preferred side; the tooltip flips or shifts when there is not enough room there. */
  placement?: Side
  /** A small illustration shown above the text (picture tooltip). */
  media?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; side: Side } | null>(null)

  const show = (): void => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 450)
  }
  const hide = (): void => {
    clearTimeout(timer.current)
    setOpen(false)
    setPos(null)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // Measure the rendered (still invisible) tooltip, then place it inside the viewport. Re-placed on window resize.
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const a = ref.current?.getBoundingClientRect()
      const t = tip.current
      if (!a || !t) return
      setPos(
        placeFloating({
          anchor: { left: a.left, top: a.top, width: a.width, height: a.height },
          size: { width: t.offsetWidth, height: t.offsetHeight },
          viewport: {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight
          },
          preferred: placement
        })
      )
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, placement, label, hint, shortcut])

  // `ref` wraps the trigger; the hidden first pass sits at 0,0 so its natural (max-width-limited) size is measured.
  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { left: 0, top: 0, visibility: 'hidden' }
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
      {open &&
        createPortal(
          <div
            ref={tip}
            role="tooltip"
            className={`ui-tip${media ? ' rich' : ''}`}
            data-side={pos?.side}
            style={style}
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
