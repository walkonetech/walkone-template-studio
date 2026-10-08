import { useId, useState } from 'react'
import {
  PRINT_DPIS,
  describeNewProject,
  presetIdFor,
  type PrintDpi,
  type PrintType,
  type SheetOrientation
} from '@editor/welcome'
import { editorStore } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

function Form(): React.JSX.Element {
  const nameId = useId()
  const typeId = useId()
  const orientId = useId()
  const dpiId = useId()
  const [name, setName] = useState('Untitled')
  const [type, setType] = useState<PrintType>('photo-4x6')
  const [orientation, setOrientation] = useState<SheetOrientation>('portrait')
  const [dpi, setDpi] = useState<PrintDpi>(600)
  const preset = presetIdFor(type, orientation, dpi)
  const info = describeNewProject(type, orientation, dpi)
  const close = (): void => layoutStore.getState().setNewProjectOpen(false)
  const create = async (): Promise<void> => {
    close()
    await editorStore.getState().createProject({ name: name.trim() || 'Untitled', preset })
  }
  return (
    <Dialog
      title="New project"
      onEscape={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void create()}>
            Create
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
        onKeyDown={(e) => {
          // Enter creates from the name field (explicit, so it does not depend on implicit form submission).
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault()
            void create()
          }
        }}
      >
        <label htmlFor={nameId}>Project name</label>
        <input
          id={nameId}
          className="ui-input"
          data-autofocus
          value={name}
          maxLength={120}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span id={typeId}>Print type</span>
        <div className="seg wide" role="radiogroup" aria-labelledby={typeId}>
          {(
            [
              ['photo-4x6', '4×6 Photo'],
              ['strip-2x6', '2×6 Photo Strip']
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={type === value}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {type === 'photo-4x6' && (
          <>
            <label htmlFor={orientId}>Orientation</label>
            <select
              id={orientId}
              className="ui-select"
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as SheetOrientation)}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </>
        )}
        <label htmlFor={dpiId}>Resolution</label>
        <select
          id={dpiId}
          className="ui-select"
          value={dpi}
          onChange={(e) => setDpi(Number(e.target.value) as PrintDpi)}
        >
          {PRINT_DPIS.map((d) => (
            <option key={d} value={d}>
              {d} DPI
            </option>
          ))}
        </select>
        <div className="sheet-info" data-testid="new-project-info" data-preset={preset}>
          <div>{info.design}</div>
          {info.sheet && <div>{info.sheet}</div>}
          <p>{info.note}</p>
        </div>
        <button type="submit" className="sr-only" tabIndex={-1}>
          Create
        </button>
      </form>
    </Dialog>
  )
}

export function NewProjectDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.newProjectOpen)
  return open ? <Form /> : null
}
