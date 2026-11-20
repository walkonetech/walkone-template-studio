import { Check } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type MenuEntry =
  | {
      id: string
      label: string
      shortcut?: string
      disabled?: boolean
      /** true/false renders a check column (checkable item); undefined renders none. */
      checked?: boolean | undefined
      onSelect: () => void
    }
  | 'separator'

/**
 * A menu popover anchored under (or beside) a trigger. role=menu with arrow-key navigation, Home/End, Escape to close
 * (focus returns to the trigger), click outside to close. ArrowLeft/ArrowRight are reported so a menu bar can switch.
 */
export function MenuPopover({
  anchor,
  entries,
  label,
  onClose,
  onHorizontal,
  align = 'start'
}: {
  anchor: HTMLElement
  entries: readonly MenuEntry[]
  label: string
  onClose: () => void
  onHorizontal?: (dir: -1 | 1) => void
  align?: 'start' | 'end'
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 220
    const left = align === 'end' ? a.right - w : a.left
    setPos({ left: Math.max(8, Math.min(left, window.innerWidth - w - 8)), top: a.bottom + 4 })
  }, [anchor, align])

  const items = (): HTMLButtonElement[] => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>(
      'button[role^="menuitem"]:not(:disabled)'
    ) ?? [])
  ]

  useEffect(() => {
    items()[0]?.focus()
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    return () => window.removeEventListener('mousedown', onDown, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    const list = items()
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    const focus = (n: number): void => {
      e.preventDefault()
      list[(n + list.length) % list.length]?.focus()
    }
    if (e.key === 'ArrowDown') focus(i + 1)
    else if (e.key === 'ArrowUp') focus(i < 0 ? list.length - 1 : i - 1)
    else if (e.key === 'Home') focus(0)
    else if (e.key === 'End') focus(list.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
      anchor.focus()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose()
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onHorizontal) {
      e.preventDefault()
      onHorizontal(e.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  const hasChecks = entries.some((e) => e !== 'separator' && e.checked !== undefined)
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className="ui-menu"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onKeyDown={onKeyDown}
    >
      {entries.map((e, i) =>
        e === 'separator' ? (
          <div key={`s${i}`} role="separator" className="ui-menusep" />
        ) : (
          <button
            key={e.id}
            type="button"
            role={e.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            {...(e.checked !== undefined ? { 'aria-checked': e.checked } : {})}
            disabled={e.disabled}
            className="ui-menuitem"
            onClick={() => {
              onClose()
              e.onSelect()
            }}
          >
            {hasChecks && (
              <span className="check">{e.checked && <Check size={14} aria-hidden="true" />}</span>
            )}
            <span className="grow">{e.label}</span>
            {e.shortcut && <kbd>{e.shortcut}</kbd>}
          </button>
        )
      )}
    </div>,
    document.body
  )
}

/** A button that opens a menu. Used for the Add menu and the Arrange menu. */
export function MenuButton({
  label,
  entries,
  children,
  className,
  align
}: {
  label: string
  entries: readonly MenuEntry[]
  children: React.ReactNode
  className?: string
  align?: 'start' | 'end'
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const open = anchor !== null
  const close = useCallback(() => setAnchor(null), [])
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => setAnchor(open ? null : e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setAnchor(e.currentTarget)
          }
        }}
      >
        {children}
      </button>
      {anchor && (
        <MenuPopover
          anchor={anchor}
          entries={entries}
          label={label}
          onClose={close}
          {...(align ? { align } : {})}
        />
      )}
    </>
  )
}

/** Focuses the first title of the application menu bar (F10 on Windows / Linux). */
export function focusMenuBar(): void {
  document.querySelector<HTMLButtonElement>('[role=menubar] button.menubar-btn')?.focus()
}

/**
 * File / Edit / View style bar: one menu open at a time; hovering another title switches; Left/Right move between.
 * With `accessKeys` (Windows / Linux), Alt + a title's first letter opens that menu and holding Alt underlines the
 * letters, as in native Windows menus.
 */
export function MenuBar({
  menus,
  label,
  accessKeys = false
}: {
  menus: readonly { id: string; label: string; entries: readonly MenuEntry[] }[]
  label: string
  accessKeys?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState<{ id: string; anchor: HTMLElement } | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(null), [])
  const buttons = (): HTMLButtonElement[] => [
    ...(bar.current?.querySelectorAll<HTMLButtonElement>('button.menubar-btn') ?? [])
  ]
  const openAt = (el: HTMLElement | undefined): void => {
    const id = el?.dataset['menuId']
    if (el && id) setOpen({ id, anchor: el })
  }
  const move = (dir: -1 | 1): void => {
    const list = buttons()
    const i = list.findIndex((b) => b === open?.anchor)
    openAt(list[(i + dir + list.length) % list.length])
  }
  const current = menus.find((m) => m.id === open?.id)
  useEffect(() => {
    if (!accessKeys) return
    const down = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') return setAltHeld(true)
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (document.querySelector('[role=dialog][aria-modal=true]')) return
      const letter = e.key.toLowerCase()
      const el = buttons().find((b) => b.textContent?.trim().toLowerCase().startsWith(letter))
      if (!el) return
      e.preventDefault()
      setAltHeld(false)
      el.focus()
      openAt(el)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') setAltHeld(false)
    }
    const blur = (): void => setAltHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [accessKeys])
  return (
    <div
      role="menubar"
      aria-label={label}
      className={`menubar${altHeld ? ' show-access-keys' : ''}`}
      ref={bar}
    >
      {menus.map((m) => (
        <span key={m.id} className="menubar-item">
          <button
            type="button"
            role="menuitem"
            data-menu-id={m.id}
            className={`menubar-btn ${open?.id === m.id ? 'open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={open?.id === m.id}
            onClick={(e) => (open?.id === m.id ? close() : openAt(e.currentTarget))}
            onMouseEnter={(e) => open && openAt(e.currentTarget)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                openAt(e.currentTarget)
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const list = buttons()
                const i = list.indexOf(e.currentTarget)
                list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]?.focus()
              }
            }}
          >
            {accessKeys ? (
              <>
                <u className="access-key">{m.label.slice(0, 1)}</u>
                {m.label.slice(1)}
              </>
            ) : (
              m.label
            )}
          </button>
        </span>
      ))}
      {open && current && (
        <MenuPopover
          anchor={open.anchor}
          entries={current.entries}
          label={current.label}
          onClose={close}
          onHorizontal={move}
        />
      )}
    </div>
  )
}
