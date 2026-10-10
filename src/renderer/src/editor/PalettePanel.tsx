import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { PaletteRole } from '@domain'
import { ROLE_LABELS, SEMANTIC_ROLES, paletteReferences } from '@editor/paletteMutations'
import { editorStore, useEditor } from './editorStore'
import { ColorField, SelectField, TextField } from './fields'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Tooltip } from '../ui/Tooltip'

/**
 * Event Palette: the project's named colours (Primary, Secondary, Accent, Background, Text and any custom ones).
 * Layers reference entries by id, so editing a value recolours every linked property at once (text colour, shape fill
 * and stroke, photo frame, canvas background). Removal is refused while anything still uses an entry.
 */
export function PalettePanel(): React.JSX.Element | null {
  const project = useEditor((s) => s.project)
  const [newRole, setNewRole] = useState<PaletteRole>('custom')
  if (!project) return null
  const st = editorStore.getState
  const colors = project.palette.colors
  const free = SEMANTIC_ROLES.filter((r) => !colors.some((c) => c.role === r))
  return (
    <section aria-label="Event palette" data-testid="event-palette">
      <h3 className="section-heading">Event palette</h3>
      {colors.length === 0 && (
        <>
          <p className="field-note">
            No palette colors yet. Define the event&apos;s colors once, link text and shapes to
            them, and change a color everywhere in one edit.
          </p>
          <div className="button-row">
            <Button size="sm" icon={Plus} onClick={() => st().addBasicPalette()}>
              Add basic colors
            </Button>
          </div>
        </>
      )}
      <ul className="palette-list" aria-label="Palette colors">
        {colors.map((c) => {
          const used = paletteReferences(project, c.id).length
          return (
            <li key={c.id} className="palette-row" data-palette-id={c.id}>
              <div className="palette-row-head">
                <span className="swatch" style={{ background: c.value }} aria-hidden="true" />
                <span className="palette-name" title={`${c.name} ${c.value}`}>
                  {c.name}
                </span>
                <span className="palette-use" data-testid="palette-usage">
                  {used === 0 ? 'Not used' : `Used by ${used}`}
                </span>
                <Tooltip
                  label="Remove color"
                  hint={
                    used > 0
                      ? `In use by ${used} propert${used === 1 ? 'y' : 'ies'}: switch those to another color first`
                      : 'Remove this unused palette color'
                  }
                >
                  <IconButton
                    size="sm"
                    icon={Trash2}
                    label={`Remove ${c.name} from the palette`}
                    onClick={() => st().removePaletteColor(c.id)}
                  />
                </Tooltip>
              </div>
              {c.role === 'custom' && (
                <TextField
                  label="Name"
                  value={c.name}
                  allowEmpty={false}
                  onCommit={(name) => st().renamePaletteColor(c.id, name)}
                />
              )}
              <ColorField
                label={c.role === 'custom' ? 'Color' : `${c.name} color`}
                value={{ kind: 'literal', value: c.value }}
                palette={project.palette}
                allowLink={false}
                onCommit={(cv, continuous) =>
                  cv.kind === 'literal' &&
                  st().setPaletteColor(
                    c.id,
                    cv.value,
                    continuous ? { coalesceKey: `palette:${c.id}` } : {}
                  )
                }
              />
            </li>
          )
        })}
      </ul>
      <div className="palette-add">
        <SelectField
          label="Add"
          value={newRole}
          options={[
            ...free.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
            { value: 'custom' as PaletteRole, label: 'Custom color' }
          ]}
          onCommit={setNewRole}
        />
        <Button
          size="sm"
          icon={Plus}
          onClick={() => {
            const role = free.includes(newRole) ? newRole : 'custom'
            st().addPaletteColor({
              role,
              value:
                role === 'custom'
                  ? '#b76e79'
                  : ((
                      {
                        primary: '#4a6fa5',
                        secondary: '#f5efe4',
                        accent: '#c6a45d',
                        background: '#ffffff',
                        text: '#222222'
                      } as Record<string, string>
                    )[role] ?? '#888888')
            })
            setNewRole('custom')
          }}
        >
          Add color
        </Button>
      </div>
    </section>
  )
}
