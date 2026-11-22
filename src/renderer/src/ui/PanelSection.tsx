import { ChevronDown } from 'lucide-react'
import { useId } from 'react'

/**
 * Collapsible titled section. Controlled (the caller owns `open`) so collapse state survives selection changes.
 * B5: a closed section can show a one-line `summary` of what is inside ("X 120 · Y 2700 · 960 × 270"), so the values
 * stay readable without opening it. Opening or closing never edits anything.
 */
export function PanelSection({
  title,
  open,
  onToggle,
  children,
  aside,
  summary,
  sectionId
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Small right-aligned content in the header (e.g. a badge). */
  aside?: React.ReactNode
  /** Shown in the header while the section is closed. */
  summary?: string
  /** Stable id for tests and styles (`data-section`). */
  sectionId?: string
}): React.JSX.Element {
  const id = useId()
  return (
    <section
      className={`psection${open ? ' open' : ''}`}
      aria-labelledby={`${id}-h`}
      {...(sectionId ? { 'data-section': sectionId } : {})}
    >
      <h3 className="psection-head" id={`${id}-h`}>
        <button
          type="button"
          className="psection-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          <ChevronDown size={14} aria-hidden="true" className={open ? '' : 'collapsed'} />
          <span className="psection-title">{title}</span>
          {!open && summary && <span className="psection-summary">{summary}</span>}
        </button>
        {aside}
      </h3>
      {open && (
        <div className="psection-body" id={`${id}-body`}>
          {children}
        </div>
      )}
    </section>
  )
}
