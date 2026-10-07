import { useId, useState } from 'react'
import { DEFAULT_PRESET, PRESET_OPTIONS } from '@editor/welcome'
import type { PrintPresetId } from '@domain'
import { editorStore } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

function Form(): React.JSX.Element {
  const nameId = useId()
  const fmtId = useId()
  const [name, setName] = useState('Untitled')
  const [preset, setPreset] = useState<PrintPresetId>(DEFAULT_PRESET)
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
        <label htmlFor={fmtId}>Print format</label>
        <select
          id={fmtId}
          className="ui-select"
          value={preset}
          onChange={(e) => setPreset(e.target.value as PrintPresetId)}
        >
          {PRESET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
