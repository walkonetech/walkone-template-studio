import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { placeFloating, type Side } from '@editor/floatingPlacement'
import { restoreFocus } from './restoreFocus'

/**
 * A non-modal popover anchored to a trigger (role=dialog, labelled). Placed with the same viewport-aware rule as
 * tooltips (`placeFloating`), so it always stays inside the window. Escape or a click outside closes it and focus
 * returns to the trigger; it is the FIRST thing Escape closes (7A order: popover, floating drawer, Reposition,
 * selection).
 */
export function Popover({
  anchor,
  label,
  onClose,
  placement = 'bottom',
  className,
  testId,
  children
}: {
  anchor: HTMLElement
  label: string
  onClose: () => void
  placement?: Side
  className?: string
  testId?: string
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const place = (): void => {
      const a = anchor.getBoundingClientRect()
      const el = ref.current
      if (!el) return
      const p = placeFloating({
        anchor: { left: a.left, top: a.top, width: a.width, height: a.height },
        size: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight
        },
        preferred: placement,
        gap: 6
      })
      setPos({ left: p.left, top: p.top })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchor, placement, children])

  // Focus moves in once the popover is placed (a hidden element cannot take focus).
  const placed = pos !== null
  useEffect(() => {
    if (placed) ref.current?.focus()
  }, [placed])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose()
    }
    // Escape closes the popover wherever focus is (it is the first thing Escape closes).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || document.querySelector('[role=dialog][aria-modal=true]')) return
      e.preventDefault()
      e.stopPropagation()
      onClose()
      restoreFocus(anchor)
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      className={`ui-popover${className ? ` ${className}` : ''}`}
      data-popover
      {...(testId ? { 'data-testid': testId } : {})}
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body
  )
}
