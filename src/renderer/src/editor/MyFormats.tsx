import { useEffect, useId, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { summarizeFormat, type FormatDefinition } from '@domain'
import { sheetDiagram, wizardFrom } from '@editor/formatWizard'
import type { FormatPresetItem } from '@shared/ipc'
import { editorStore } from './editorStore'
import { FormatDiagram } from './FormatDiagram'
import { formatsStore, useFormats } from './formatsStore'
import { layoutStore } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { Tooltip } from '../ui/Tooltip'

/**
 * My formats (Phase 7B B5.5): saved custom formats on this computer. Use opens the Custom Size wizard on its Review
 * step with the format filled in (nothing is created until Create design). Rename and Delete act on the saved format
 * only; projects made from it are not affected. Built-in formats are not listed here and cannot be deleted.
 */

/** Opens the Custom Size wizard (fresh, or from a saved format), after the usual unsaved-changes guard. */
export function openCustomFormat(format: FormatDefinition | null, projectName?: string): void {
  void editorStore
    .getState()
    .guardClose('replace')
    .then((ok) => {
      if (!ok) return
      layoutStore.getState().setNewProjectOpen(false)
      layoutStore
        .getState()
        .setCustomFormat({ format, ...(projectName !== undefined ? { projectName } : {}) })
    })
}

/** A small format thumbnail: the paper with its copies (neutral shapes). */
export function FormatThumb({
  format,
  box = 72
}: {
  format: FormatDefinition
  box?: number
}): React.JSX.Element | null {
  const d = sheetDiagram(wizardFrom(format, 'review'))
  return (
    <FormatDiagram
      sheet={d.sheet}
      copies={d.copies}
      margins={format.arrangement.kind === 'exact' ? null : format.arrangement.margins}
      box={box}
    />
  )
}

function RenameDialog({
  item,
  onClose
}: {
  item: FormatPresetItem
  onClose: () => void
}): React.JSX.Element {
  const id = useId()
  const [name, setName] = useState(item.format.name)
  const [error, setError] = useState<string | null>(null)
  const trimmed = name.trim()
  const save = async (): Promise<void> => {
    if (!trimmed) return setError('Give the format a name.')
    if (await formatsStore.getState().rename(item.id, trimmed)) onClose()
    else setError(formatsStore.getState().error ?? 'The format could not be renamed.')
  }
  return (
    <Dialog
      title="Rename format"
      size="sm"
      testId="format-rename-dialog"
      onEscape={onClose}
      footer={
        <DialogActions
          cancel={
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          }
          primary={
            <Button variant="primary" disabled={!trimmed} onClick={() => void save()}>
              Rename
            </Button>
          }
        />
      }
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label htmlFor={id}>Format name</label>
        <input
          id={id}
          className="ui-input"
          data-autofocus
          maxLength={80}
          value={name}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setName(e.target.value)
            setError(null)
          }}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            // Explicit (not implicit form submission), like New project: Enter renames.
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            }
          }}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  )
}

function DeleteDialog({
  item,
  onClose
}: {
  item: FormatPresetItem
  onClose: () => void
}): React.JSX.Element {
  const remove = async (): Promise<void> => {
    await formatsStore.getState().remove(item.id)
    onClose()
  }
  return (
    <Dialog
      title={`Delete “${item.format.name}”?`}
      description="It is removed from My formats on this computer. Projects you already made with it are not changed."
      size="sm"
      testId="format-delete-dialog"
      onEscape={onClose}
      footer={
        <DialogActions
          cancel={
            <Button variant="ghost" onClick={onClose} data-autofocus>
              Keep it
            </Button>
          }
          primary={
            <Button variant="danger-solid" onClick={() => void remove()}>
              Delete format
            </Button>
          }
        />
      }
    />
  )
}

/** The Start screen's My formats row (only when there are saved formats). */
export function MyFormatsSection(): React.JSX.Element | null {
  const items = useFormats((s) => s.items)
  const [renaming, setRenaming] = useState<FormatPresetItem | null>(null)
  const [deleting, setDeleting] = useState<FormatPresetItem | null>(null)
  useEffect(() => {
    void formatsStore.getState().refresh()
  }, [])
  if (!items || items.length === 0) return null
  return (
    <section className="my-formats" aria-labelledby="my-formats-title" data-testid="my-formats">
      <h2 className="start-heading" id="my-formats-title">
        My formats
      </h2>
      <ul className="format-grid">
        {items.map((item) => {
          const sum = summarizeFormat(item.format)
          return (
            <li key={item.id} className="format-card" data-format-id={item.id}>
              <button
                type="button"
                className="format-use"
                aria-label={`New design: ${item.format.name}, ${sum.design}, ${sum.output}`}
                onClick={() => openCustomFormat(item.format)}
              >
                <span className="format-thumb">
                  <FormatThumb format={item.format} />
                </span>
                <span className="format-text">
                  <span className="format-name">{item.format.name}</span>
                  <span className="format-meta">{sum.design}</span>
                  <span className="format-meta">{sum.output}</span>
                </span>
              </button>
              <span className="format-actions">
                <Tooltip label="Rename" hint="Rename this saved format">
                  <button
                    type="button"
                    className="ui-iconbtn sm"
                    aria-label={`Rename ${item.format.name}`}
                    data-action="rename"
                    onClick={() => setRenaming(item)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                </Tooltip>
                <Tooltip label="Delete" hint="Remove this saved format from My formats">
                  <button
                    type="button"
                    className="ui-iconbtn sm"
                    aria-label={`Delete ${item.format.name}`}
                    data-action="delete"
                    onClick={() => setDeleting(item)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </Tooltip>
              </span>
            </li>
          )
        })}
      </ul>
      {renaming && <RenameDialog item={renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteDialog item={deleting} onClose={() => setDeleting(null)} />}
    </section>
  )
}
