import { Check } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { assignMnemonics, createAltTap, mnemonicTarget, typeaheadTarget } from '@editor/menuKeys'
import { noteMenuOpener, restoreFocus } from './restoreFocus'

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
 * Letters (B6): with `accessKeys` (Windows / Linux) each item has a unique access key that activates it (underlined
 * when `showAccessKeys`, i.e. the menu was opened from the keyboard or Alt is held); without (macOS) a letter moves to
 * the next item starting with it.
 */
export function MenuPopover({
  anchor,
  entries,
  label,
  onClose,
  onHorizontal,
  align = 'start',
  accessKeys = false,
  showAccessKeys = false
}: {
  anchor: HTMLElement
  entries: readonly MenuEntry[]
  label: string
  onClose: () => void
  onHorizontal?: (dir: -1 | 1) => void
  align?: 'start' | 'end'
  accessKeys?: boolean
  showAccessKeys?: boolean
}): React.JSX.Element {
  const itemEntries = entries.filter((e): e is Exclude<MenuEntry, 'separator'> => e !== 'separator')
  const labels = itemEntries.map((e) => e.label)
  const mnemonics = accessKeys ? assignMnemonics(labels) : labels.map(() => null)
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
      restoreFocus(anchor)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      onClose()
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && onHorizontal) {
      e.preventDefault()
      onHorizontal(e.key === 'ArrowLeft' ? -1 : 1)
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const all = [
        ...(ref.current?.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]') ?? [])
      ]
      if (accessKeys) {
        // Windows: the item's access key activates it (Alt + the letter works too while the menu is open).
        const n = mnemonicTarget(labels, mnemonics, e.key)
        if (n < 0) return
        e.preventDefault()
        e.stopPropagation()
        const b = all[n]
        if (b && !b.disabled) b.click()
      } else if (!e.altKey) {
        // macOS: type-to-select.
        const from = all.indexOf(document.activeElement as HTMLButtonElement)
        let n = typeaheadTarget(labels, from, e.key)
        for (let tries = 0; n >= 0 && all[n]?.disabled && tries < labels.length; tries++)
          n = typeaheadTarget(labels, n, e.key)
        if (n >= 0 && !all[n]?.disabled) {
          e.preventDefault()
          all[n]?.focus()
        }
      }
    }
  }

  const hasChecks = entries.some((e) => e !== 'separator' && e.checked !== undefined)
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      className={`ui-menu${showAccessKeys ? ' show-access-keys' : ''}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onKeyDown={onKeyDown}
    >
      {entries.map((e, i) => {
        if (e === 'separator') return <div key={`s${i}`} role="separator" className="ui-menusep" />
        const m = mnemonics[itemEntries.indexOf(e)] ?? null
        return (
          <button
            key={e.id}
            type="button"
            role={e.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            {...(e.checked !== undefined ? { 'aria-checked': e.checked } : {})}
            {...(m !== null ? { 'aria-keyshortcuts': `${e.label[m]!.toUpperCase()}` } : {})}
            disabled={e.disabled}
            className="ui-menuitem"
            onClick={() => {
              noteMenuOpener(anchor)
              onClose()
              e.onSelect()
            }}
          >
            {hasChecks && (
              <span className="check">{e.checked && <Check size={14} aria-hidden="true" />}</span>
            )}
            <span className="grow">
              {m === null ? (
                e.label
              ) : (
                <>
                  {e.label.slice(0, m)}
                  <u className="access-key">{e.label[m]}</u>
                  {e.label.slice(m + 1)}
                </>
              )}
            </span>
            {e.shortcut && <kbd>{e.shortcut}</kbd>}
          </button>
        )
      })}
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

/** Where keyboard focus was before F10 / a tap on Alt moved it into the menu bar (Escape or another tap returns it). */
let menuBarReturn: HTMLElement | null = null

/** Focuses the first title of the application menu bar (F10 / a tap on Alt on Windows / Linux). */
export function focusMenuBar(): void {
  const first = document.querySelector<HTMLButtonElement>('[role=menubar] button.menubar-btn')
  if (!first) return
  const active = document.activeElement
  if (
    active instanceof HTMLElement &&
    active !== document.body &&
    !active.closest('[role=menubar],[role=menu]')
  )
    menuBarReturn = active
  first.focus()
}

/**
 * Leaves the menu bar for the control that had focus before it. When there was none (the user had only clicked the
 * canvas), the workspace region takes focus, so the keyboard user is never left on the page body.
 */
function leaveMenuBar(): void {
  const back = menuBarReturn
  menuBarReturn = null
  if (back?.isConnected) return restoreFocus(back)
  const workspace = document.querySelector<HTMLElement>('[data-region="canvas"]')
  if (workspace) {
    if (!workspace.hasAttribute('tabindex')) workspace.setAttribute('tabindex', '-1')
    restoreFocus(workspace)
  } else (document.activeElement as HTMLElement | null)?.blur()
}

/**
 * File / Edit / View style bar: one menu open at a time; hovering another title switches; Left/Right move between.
 * With `accessKeys` (Windows / Linux), as in native Windows menus (B6): F10 or a tap on Alt focuses the bar and shows
 * the access-key underlines (Escape or another tap returns focus); holding Alt shows them too; Alt + a title's first
 * letter opens that menu; inside an open menu each item has its own access key. Underlines show only while the menu
 * bar is used from the keyboard and never linger after it.
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
  const [open, setOpen] = useState<{ id: string; anchor: HTMLElement; keyboard: boolean } | null>(
    null
  )
  const [altHeld, setAltHeld] = useState(false)
  const [keyboardInBar, setKeyboardInBar] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(null), [])
  const buttons = (): HTMLButtonElement[] => [
    ...(bar.current?.querySelectorAll<HTMLButtonElement>('button.menubar-btn') ?? [])
  ]
  const openAt = (el: HTMLElement | undefined, keyboard: boolean): void => {
    const id = el?.dataset['menuId']
    if (el && id) setOpen({ id, anchor: el, keyboard })
  }
  const move = (dir: -1 | 1): void => {
    const list = buttons()
    const i = list.findIndex((b) => b === open?.anchor)
    openAt(list[(i + dir + list.length) % list.length], true)
  }
  const current = menus.find((m) => m.id === open?.id)
  useEffect(() => {
    if (!accessKeys) return
    const tap = createAltTap()
    const modal = (): boolean => document.querySelector('[role=dialog][aria-modal=true]') !== null
    const down = (e: KeyboardEvent): void => {
      tap.down(e.key, e.repeat)
      if (e.key === 'Alt') return setAltHeld(true)
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (modal()) return
      // An open menu handles its own access keys first (it stops the event); this is Alt + a menu title.
      const letter = e.key.toLowerCase()
      const el = buttons().find((b) => b.textContent?.trim().toLowerCase().startsWith(letter))
      if (!el) return
      e.preventDefault()
      setAltHeld(false)
      focusMenuBar()
      el.focus()
      openAt(el, true)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.key === 'Alt') setAltHeld(false)
      if (!tap.up(e.key) || modal()) return
      // A tap on Alt: into the menu bar, or (from inside it) back out, closing any open menu.
      e.preventDefault()
      const inside =
        document.activeElement instanceof Element &&
        document.activeElement.closest('[role=menubar],[role=menu]') !== null
      if (inside) {
        setOpen(null)
        leaveMenuBar()
      } else focusMenuBar()
    }
    const cancel = (): void => {
      tap.cancel()
      setAltHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', cancel)
    window.addEventListener('mousedown', cancel, true)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('mousedown', cancel, true)
    }
  }, [accessKeys])
  return (
    <div
      role="menubar"
      aria-label={label}
      className={`menubar${accessKeys && (altHeld || keyboardInBar || open?.keyboard) ? ' show-access-keys' : ''}`}
      ref={bar}
      onFocus={(e) => {
        if (e.target instanceof HTMLElement && e.target.matches(':focus-visible'))
          setKeyboardInBar(true)
      }}
      onBlur={(e) => {
        const to = e.relatedTarget
        if (!(to instanceof Node) || !bar.current?.contains(to)) setKeyboardInBar(false)
      }}
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
            {...(accessKeys
              ? { 'aria-keyshortcuts': `Alt+${m.label.slice(0, 1).toUpperCase()}` }
              : {})}
            onClick={(e) =>
              open?.id === m.id
                ? close()
                : // detail 0: Enter / Space (or assistive technology), not a mouse click.
                  openAt(e.currentTarget, e.detail === 0)
            }
            onMouseEnter={(e) => open && openAt(e.currentTarget, false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                openAt(e.currentTarget, true)
              } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const list = buttons()
                const i = list.indexOf(e.currentTarget)
                list[(i + (e.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length]?.focus()
              } else if (e.key === 'Escape') {
                // First Escape closes an open menu (focus stays on its title, e.g. a menu whose items are all
                // unavailable); the next leaves the menu bar, back to where the keyboard user was.
                e.preventDefault()
                e.stopPropagation()
                if (open) close()
                else leaveMenuBar()
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
          // One instance per menu: switching menus (Left/Right, Alt + letter, hover) focuses the new menu's first item.
          key={open.id}
          anchor={open.anchor}
          entries={current.entries}
          label={current.label}
          onClose={close}
          onHorizontal={move}
          accessKeys={accessKeys}
          showAccessKeys={open.keyboard || altHeld}
        />
      )}
    </div>
  )
}
