import { ChevronDown } from 'lucide-react'
import { useId } from 'react'

/** Collapsible titled section. Controlled (the caller owns `open`) so collapse state survives selection changes. */
export function PanelSection({
  title,
  open,
  onToggle,
  children,
  aside
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  /** Small right-aligned content in the header (e.g. a badge). */
  aside?: React.ReactNode
}): React.JSX.Element {
  const id = useId()
  return (
    <section className="psection" aria-labelledby={`${id}-h`}>
      <h3 className="psection-head" id={`${id}-h`}>
        <button
          type="button"
          className="psection-toggle"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={onToggle}
        >
          <ChevronDown size={14} aria-hidden="true" className={open ? '' : 'collapsed'} />
          {title}
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
