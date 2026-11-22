import { useEffect, useId, useState } from 'react'
import { Ruler } from 'lucide-react'
import { summarizeFormat, type FormatDefinition } from '@domain'
import { formatsStore, useFormats } from './formatsStore'
import { FormatThumb } from './MyFormats'
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
import { Dialog, DialogActions } from '../ui/Dialog'

/**
 * Other sizes (B5.5): Custom size… opens the Custom Size wizard; My formats are saved custom formats. The built-in
 * formats above stay exactly as they were (2×6 strip, 4×6 portrait / landscape at 300 or 600 DPI).
 */
function OtherFormats({ name }: { name: string }): React.JSX.Element {
  const items = useFormats((s) => s.items)
  useEffect(() => {
    void formatsStore.getState().refresh()
  }, [])
  const projectName = name.trim() || 'Untitled'
  const use = (format: FormatDefinition | null): void => {
    layoutStore.getState().setNewProjectOpen(false)
    layoutStore
      .getState()
      .setCustomFormat({ format, projectName: format ? format.name : projectName })
  }
  return (
    <div className="new-other" data-testid="new-project-other">
      <span className="cf-label">Other sizes</span>
      <div className="new-other-list">
        <button
          type="button"
          className="new-format-btn"
          id="new-custom-size"
          onClick={() => use(null)}
        >
          <Ruler size={16} aria-hidden="true" />
          <span>
            <span className="new-format-name">Custom size…</span>
            <span className="new-format-meta">
              Any size: magnets, keychains, wallet prints, squares
            </span>
          </span>
        </button>
        {(items ?? []).map((item) => (
          <button
            key={item.id}
            type="button"
            className="new-format-btn"
            data-format-id={item.id}
            onClick={() => use(item.format)}
          >
            <span className="new-format-thumb">
              <FormatThumb format={item.format} box={28} />
            </span>
            <span>
              <span className="new-format-name">{item.format.name}</span>
              <span className="new-format-meta">
                {summarizeFormat(item.format).design} · {summarizeFormat(item.format).output}
              </span>
            </span>
          </button>
        ))}
      </div>
      {items && items.length > 0 && (
        <span className="field-note">My formats are saved on this computer.</span>
      )}
    </div>
  )
}

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
    const r = await editorStore
      .getState()
      .createProject({ name: name.trim() || 'Untitled', preset })
    // A new BLANK project gets the getting-started tips (B5; the tips themselves check the app preference).
    const sessionId = editorStore.getState().session?.sessionId
    if (r.status === 'ok' && sessionId) layoutStore.getState().startTips(sessionId)
  }
  return (
    <Dialog
      title="New project"
      size="md"
      testId="new-project-dialog"
      onEscape={close}
      footer={
        <DialogActions
          cancel={
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
          }
          primary={
            <Button variant="primary" onClick={() => void create()}>
              Create
            </Button>
          }
        />
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
        <OtherFormats name={name} />
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
