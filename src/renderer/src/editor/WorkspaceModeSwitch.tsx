import { useRef } from 'react'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { selectViewMode } from '@editor/store'
import { editorStore, useEditor } from './editorStore'

const MODES = [
  { id: 'design', label: 'Design', hint: 'Edit the single design' },
  { id: 'preview', label: 'Print Preview', hint: 'See the print sheet with every copy (read-only)' }
] as const

/**
 * Design / Print Preview switch. Shown only when the project prints several copies per sheet (e.g. a 2×6 strip on a
 * 4×6 sheet); for ordinary projects both views would be identical, so there is nothing to switch. A radiogroup:
 * Tab to it, Arrow keys move and select. Switching is editor state only (never dirty, never in history).
 */
export function WorkspaceModeSwitch(): React.JSX.Element | null {
  const show = useEditor((s) => s.project !== null && hasDerivedCopies(s.project))
  const mode = useEditor(selectViewMode)
  const group = useRef<HTMLDivElement>(null)
  if (!show) return null
  const choose = (id: 'design' | 'preview'): void => editorStore.getState().setViewMode(id)
  return (
    <div
      ref={group}
      className="workspace-mode"
      role="radiogroup"
      aria-label="Workspace view"
      data-testid="workspace-mode"
      data-editor-panel
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
        e.preventDefault()
        e.stopPropagation()
        const next = mode === 'design' ? 'preview' : 'design'
        choose(next)
        group.current?.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)?.focus()
      }}
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          data-mode={m.id}
          aria-checked={mode === m.id}
          tabIndex={mode === m.id ? 0 : -1}
          title={m.hint}
          onClick={() => choose(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
