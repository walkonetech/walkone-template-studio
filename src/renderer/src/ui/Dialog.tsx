import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * Modal dialog shell for renderer-controlled dialogs (new project, recovery). role=dialog + aria-modal, labelled by
 * its title, focus moves in on open (first [data-autofocus] or first control), Tab is trapped, Escape calls
 * `onEscape`, and focus returns to where it was. Native OS prompts (unsaved changes) intentionally do NOT use this.
 */
export function Dialog({
  title,
  description,
  onEscape,
  footer,
  children,
  width
}: {
  title: string
  description?: React.ReactNode
  onEscape?: () => void
  footer?: React.ReactNode
  children?: React.ReactNode
  width?: number
}): React.JSX.Element {
  const titleId = useId()
  const descId = useId()
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const target =
      box.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      box.current?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    return () => previous?.focus?.()
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
        className="ui-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description ? { 'aria-describedby': descId } : {})}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
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
        {children && <div className="body">{children}</div>}
        {footer && <footer>{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
