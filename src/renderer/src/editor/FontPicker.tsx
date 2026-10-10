import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, TriangleAlert } from 'lucide-react'
import { fontOptions, primaryFamily, type FontOption } from '@editor/fonts'
import { fontStatusOf, loadFontCatalog, pickerFamilies, useFontCatalog } from './fontCatalog'
import { FieldRow } from './fields'

const PAGE = 60

/**
 * Searchable font picker (a combobox with a listbox). Browsing and typing never change the layer: only choosing an
 * option (click, or Enter on the active one) commits. Each row is drawn in its own typeface, but only a page of rows
 * is rendered at a time so a large installed-font list stays fast. A requested font that is not installed stays in the
 * list, marked "not installed", so it can be kept; any typed name can be requested manually.
 */
export function FontPicker({
  label,
  value,
  projectFonts,
  disabled,
  onCommit
}: {
  label: string
  value: string
  projectFonts: readonly string[]
  disabled?: boolean | undefined
  onCommit: (family: string) => void
}): React.JSX.Element {
  const catalog = useFontCatalog()
  const inputId = useId()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [shown, setShown] = useState(PAGE)
  const anchor = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const status = fontStatusOf(value)
  const missing = status.availability === 'missing'

  useEffect(() => {
    if (open) void loadFontCatalog(true)
  }, [open])

  const options = useMemo<FontOption[]>(
    () =>
      fontOptions({
        query,
        installed: pickerFamilies(catalog, projectFonts),
        current: value,
        catalogReady: catalog.status === 'ready'
      }),
    [query, catalog, projectFonts, value]
  )
  const openList = (): void => {
    setRect(anchor.current?.getBoundingClientRect() ?? null)
    setQuery('')
    setActive(0)
    setShown(PAGE)
    setOpen(true)
  }
  const close = (): void => {
    setOpen(false)
    setQuery('')
  }
  const choose = (o: FontOption | undefined): void => {
    if (!o) return
    close()
    if (o.family !== primaryFamily(value)) onCommit(o.family)
  }
  const visible = options.slice(0, shown)
  const activeId = open && visible[active] ? `${listId}-${active}` : undefined
  const note =
    catalog.status === 'ready'
      ? null
      : catalog.status === 'loading'
        ? 'Looking for installed fonts…'
        : 'The installed-font list is not available here, so only common fonts are listed. Type any font name to use it.'

  return (
    <FieldRow label={label} htmlFor={inputId}>
      <span className="font-picker">
        <span className="font-picker-box">
          <input
            ref={anchor}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-describedby={missing ? `${inputId}-missing` : undefined}
            className="ui-input"
            style={{ fontFamily: `"${primaryFamily(value)}", Helvetica, Arial, sans-serif` }}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            value={open ? query : value}
            placeholder={open ? 'Search fonts…' : undefined}
            onFocus={() => !open && openList()}
            onClick={() => !open && openList()}
            onChange={(e) => {
              if (!open) openList()
              setQuery(e.target.value)
              setActive(0)
              setShown(PAGE)
            }}
            onBlur={() => window.setTimeout(close, 120)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (!open) openList()
                else setActive((a) => Math.min(a + 1, visible.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && open) {
                e.preventDefault()
                choose(visible[active])
              } else if (e.key === 'Escape' && open) {
                e.preventDefault()
                e.stopPropagation()
                close()
              }
            }}
          />
          <ChevronDown size={14} aria-hidden="true" className="font-picker-chevron" />
        </span>
        {missing && (
          <span id={`${inputId}-missing`} className="font-warning" role="status">
            <TriangleAlert size={12} aria-hidden="true" /> Not installed here: showing a fallback
          </span>
        )}
      </span>
      {open &&
        rect &&
        createPortal(
          <ul
            id={listId}
            role="listbox"
            aria-label={`${label} options`}
            className="font-list"
            style={{
              // keep the list on screen: it can be wider than the field
              left: Math.max(
                8,
                Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - 8)
              ),
              top: rect.bottom + 4,
              width: Math.max(rect.width, 260)
            }}
          >
            {note && (
              <li role="presentation" className="font-list-note">
                {note}
              </li>
            )}
            {visible.length === 0 && (
              <li role="presentation" className="font-list-note">
                No matching fonts
              </li>
            )}
            {visible.map((o, i) => (
              <li
                key={`${o.kind}:${o.family}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.family.toLowerCase() === primaryFamily(value).toLowerCase()}
                className={`font-option ${i === active ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o)
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span
                  className="font-option-name"
                  style={{
                    fontFamily:
                      o.kind === 'manual'
                        ? undefined
                        : `"${o.family}", Helvetica, Arial, sans-serif`
                  }}
                >
                  {o.kind === 'manual' ? `Use “${o.family}”` : o.family}
                </span>
                {o.kind === 'current-missing' && (
                  <span className="font-tag warn">
                    <TriangleAlert size={11} aria-hidden="true" /> not installed
                  </span>
                )}
                {o.kind === 'generic' && <span className="font-tag">generic</span>}
                {o.kind === 'manual' && <span className="font-tag">type to request</span>}
              </li>
            ))}
            {options.length > shown && (
              <li role="presentation">
                <button
                  type="button"
                  className="font-more"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    setShown((n) => n + PAGE)
                  }}
                >
                  Show more ({options.length - shown} more)
                </button>
              </li>
            )}
          </ul>,
          document.body
        )}
    </FieldRow>
  )
}
