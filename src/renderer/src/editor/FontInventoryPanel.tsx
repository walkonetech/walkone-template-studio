import { useState } from 'react'
import { Check, CircleHelp, TriangleAlert } from 'lucide-react'
import { fontInventory } from '@editor/fonts'
import { editorStore, useEditor } from './editorStore'
import { fontEnvironment, useFontCatalog } from './fontCatalog'
import { FontPicker } from './FontPicker'

/** Fonts the project asks for, with this computer's availability. Replacing a missing font is explicit, never automatic. */
export function FontInventoryPanel(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  useFontCatalog()
  const [replacing, setReplacing] = useState<string | null>(null)
  if (!project) return null
  const inv = fontInventory(project, fontEnvironment())
  if (inv.total === 0) return null
  const projectFonts = inv.entries.map((e) => e.family)
  return (
    <section aria-label="Project fonts" data-testid="font-inventory">
      <h3 className="section-heading">Fonts in this project</h3>
      <p className="field-note" data-testid="font-summary">
        {inv.total} font{inv.total === 1 ? '' : 's'} used
        {inv.missing > 0 ? `, ${inv.missing} missing` : ''}
        {inv.unknown > 0 ? `, ${inv.unknown} not checked` : ''}
      </p>
      <ul className="font-inventory">
        {inv.entries.map((e) => (
          <li key={e.family} className={`font-inv-row ${e.availability}`}>
            <span className="font-inv-state">
              {e.availability === 'available' ? (
                <Check size={13} aria-label="Installed" />
              ) : e.availability === 'missing' ? (
                <TriangleAlert size={13} aria-label="Missing" />
              ) : (
                <CircleHelp size={13} aria-label="Not checked" />
              )}
            </span>
            <span
              className="font-inv-name"
              style={{ fontFamily: `"${e.family}", Helvetica, Arial, sans-serif` }}
            >
              {e.family}
            </span>
            <span className="font-inv-uses">
              {e.availability === 'missing' ? 'missing · ' : ''}
              {e.layerIds.length}×
            </span>
            {e.availability === 'missing' && (
              <button
                type="button"
                className="link"
                onClick={() => setReplacing(replacing === e.family ? null : e.family)}
              >
                Replace…
              </button>
            )}
            {replacing === e.family && (
              <div className="font-inv-replace">
                <FontPicker
                  label={`Replace “${e.family}” with`}
                  value=""
                  projectFonts={projectFonts}
                  onCommit={(to) => {
                    editorStore.getState().replaceFont(e.family, to)
                    setReplacing(null)
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
