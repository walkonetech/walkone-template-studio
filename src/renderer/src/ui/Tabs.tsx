import { useId, useRef } from 'react'

/**
 * Tabs (WAI-ARIA tabs pattern, automatic activation): one tab stop, arrow keys / Home / End move and select, each
 * panel is labelled by its tab. Used later for Properties | Layers on short windows and in Settings.
 */
export function Tabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
  children
}: {
  label: string
  value: T
  tabs: readonly { value: T; label: string; badge?: React.ReactNode }[]
  onChange: (v: T) => void
  /** The panel for the selected tab. */
  children: React.ReactNode
}): React.JSX.Element {
  const base = useId()
  const list = useRef<HTMLDivElement>(null)
  const select = (i: number): void => {
    const t = tabs[(i + tabs.length) % tabs.length]
    if (!t) return
    onChange(t.value)
    list.current?.querySelector<HTMLButtonElement>(`[data-tab="${t.value}"]`)?.focus()
  }
  const current = tabs.findIndex((t) => t.value === value)
  return (
    <div className="ui-tabs">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        className="ui-tablist"
        onKeyDown={(e) => {
          const k = e.key
          if (k === 'ArrowRight' || k === 'ArrowDown') select(current + 1)
          else if (k === 'ArrowLeft' || k === 'ArrowUp') select(current - 1)
          else if (k === 'Home') select(0)
          else if (k === 'End') select(tabs.length - 1)
          else return
          e.preventDefault()
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`${base}-tab-${t.value}`}
            data-tab={t.value}
            aria-selected={t.value === value}
            aria-controls={`${base}-panel`}
            tabIndex={t.value === value ? 0 : -1}
            className="ui-tab"
            onClick={() => onChange(t.value)}
          >
            {t.label}
            {t.badge}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${value}`}
        className="ui-tabpanel"
      >
        {children}
      </div>
    </div>
  )
}
