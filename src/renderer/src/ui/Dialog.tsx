import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { restoreFocus } from './restoreFocus'

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** Dialog widths (CSS px before the interface scale); the dialog never exceeds the window. */
export const DIALOG_SIZES = { sm: 420, md: 560, lg: 720, xl: 880 } as const
export type DialogSize = keyof typeof DIALOG_SIZES

/**
 * Modal dialog shell (the B1 dialog contract, Phase 7B B2). role=dialog + aria-modal, labelled by its title.
 *  - Header (title, description) and footer stay visible; an optional `summary` is pinned under the header; only the
 *    BODY scrolls, with a visible edge shadow while more content is above/below (so Export never loses its button
 *    at Windows 125 % or on short windows).
 *  - Max height follows the viewport (nearly full height on very short windows).
 *  - Footer order is the same on macOS and Windows: secondary actions on the left, Cancel, then the primary action
 *    on the right (see `DialogActions`).
 *  - Focus moves in on open (first [data-autofocus], else the first control), Tab is trapped, Escape calls
 *    `onEscape`, and focus returns to where it was.
 * Native OS prompts (unsaved changes) intentionally do NOT use this.
 */
export function Dialog({
  title,
  description,
  onEscape,
  footer,
  summary,
  children,
  size,
  width,
  testId
}: {
  title: string
  description?: React.ReactNode
  onEscape?: () => void
  footer?: React.ReactNode
  /** Pinned region between the header and the scrolling body (e.g. what Export will create). */
  summary?: React.ReactNode
  children?: React.ReactNode
  size?: DialogSize
  /** Explicit width in px (older dialogs); prefer `size`. */
  width?: number
  testId?: string
}): React.JSX.Element {
  const titleId = useId()
  const descId = useId()
  const box = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState({ above: false, below: false })
  const measure = useCallback(() => {
    const el = body.current
    if (!el) return
    const above = el.scrollTop > 1
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setScroll((s) => (s.above === above && s.below === below ? s : { above, below }))
  }, [])
  useLayoutEffect(() => {
    measure()
    const el = body.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of el.children) ro.observe(child)
    return () => ro.disconnect()
  })
  const px = width ?? (size ? DIALOG_SIZES[size] : undefined)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const target =
      box.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    return () => restoreFocus(previous)
  }, [])

  // Escape must still close the dialog when focus has fallen out of it (e.g. a focused button became disabled while
  // work ran and the browser moved focus to <body>). Keys inside the dialog are handled by `onKeyDown` below.
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })
  useEffect(() => {
    const onDocKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || !escapeRef.current) return
      if (box.current?.contains(document.activeElement)) return
      if (document.activeElement?.closest('[role=dialog]')) return
      e.preventDefault()
      escapeRef.current()
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape' && onEscape) {
      e.preventDefault()
      e.stopPropagation()
      onEscape()
      return
    }
    if (e.key !== 'Tab' || !box.current) return
    const list = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (list.length === 0) return
    const first = list[0]!
    const last = list[list.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div className="ui-overlay">
      <div
        ref={box}
        className={`ui-dialog${size ? ` size-${size}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descId } : {})}
        {...(testId ? { 'data-testid': testId } : {})}
        style={px ? { width: `min(calc(${px}px * var(--ui-scale)), 100%)` } : undefined}
        onKeyDown={onKeyDown}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          {description && (
            <p id={descId} className="desc">
              {description}
            </p>
          )}
        </header>
        {summary && <div className="summary">{summary}</div>}
        {children && (
          <div
            ref={body}
            className="body"
            data-scroll-above={scroll.above || undefined}
            data-scroll-below={scroll.below || undefined}
            onScroll={measure}
          >
            {children}
          </div>
        )}
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

/**
 * The standard footer layout: optional secondary actions on the left, then Cancel, then the primary action on the
 * right. Same order on every platform (in-app dialogs, B1 D13).
 */
export function DialogActions({
  start,
  cancel,
  primary
}: {
  /** Secondary actions or a short note, pushed to the left. */
  start?: React.ReactNode
  cancel?: React.ReactNode
  primary?: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      {start && <div className="footer-start">{start}</div>}
      {cancel}
      {primary}
    </>
  )
}
