import { ChevronRight, CircleX, Info, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { DslrImportCheck, DslrImportLayout, DslrImportPreview } from '@shared/ipc'
import {
  importFoundSummary,
  importLayoutChoices,
  layoutMeaning,
  splitImportNotes
} from '@editor/importView'
import { guarded } from './commandRunner'
import { OneStripArt, WholeSheetArt } from './illustrations'
import { chooseDslrTemplate } from './dslrImportActions'
import { editorStore } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'

const ICONS = { error: CircleX, warning: TriangleAlert, info: Info } as const

const inches = (n: number): string => String(Math.round(n * 100) / 100)

function pngDataUrl(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

/** dslrBooth's own preview from the ZIP, for comparing with what Template Studio makes of it. */
function OriginalPreview({
  preview
}: {
  preview: DslrImportPreview['preview']
}): React.JSX.Element {
  // A data: URL (the page's Content Security Policy allows data: images, not blob:).
  const url = useMemo(() => (preview ? pngDataUrl(preview.data) : null), [preview])
  return (
    <figure className="dslr-import-preview">
      {preview && url ? (
        <img src={url} alt="dslrBooth’s preview of this template" />
      ) : (
        <div className="dslr-import-nopreview">No preview in this ZIP</div>
      )}
      <figcaption>As found in the file</figcaption>
    </figure>
  )
}

function NoteRow({ item }: { item: DslrImportCheck }): React.JSX.Element {
  const Icon = ICONS[item.severity]
  const tone = item.severity === 'info' ? 'info' : item.severity === 'error' ? 'error' : 'attention'
  return (
    <li
      className={`import-note preflight-item ${item.severity} tone-${tone}`}
      data-code={item.code}
    >
      <Icon size={15} aria-hidden="true" />
      <span>
        <span className="sr-only">
          {item.severity === 'info'
            ? 'Good to know'
            : item.severity === 'error'
              ? 'Error'
              : 'Needs attention'}
          :{' '}
        </span>
        {item.message}
      </span>
    </li>
  )
}

function ImportForm({ p }: { p: DslrImportPreview }): React.JSX.Element {
  const [layout, setLayout] = useState<DslrImportLayout>(p.recommendedLayout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const close = (): void => layoutStore.getState().setDslrImport(null)
  const checks = p.checks[layout] ?? []
  const found = importFoundSummary(p)
  const choices = importLayoutChoices(p)
  const notes = splitImportNotes(checks)

  const doImport = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    let outcome: string = 'cancelled'
    await guarded('replace', async () => {
      const r = await editorStore.getState().importDslr(p.token, layout)
      outcome = r.status
      if (r.status === 'error') setError(r.message)
      return r
    })()
    setBusy(false)
    if (outcome === 'ok') close()
  }

  const sizeLine = `${inches(p.widthIn)} × ${inches(p.heightIn)} in · ${p.dpi} DPI (${p.widthPx} × ${p.heightPx} px)`
  const photosLine =
    p.photoSlots === p.photoCount
      ? `${p.photoCount} per session`
      : `${p.photoCount} per session (${p.photoSlots} slots on the sheet)`

  return (
    <Dialog
      title="Import dslrBooth template"
      description={<span className="dslr-import-file">{p.fileName}</span>}
      size="xl"
      testId="dslr-import-dialog"
      onEscape={() => !busy && close()}
      footer={
        <DialogActions
          start={
            <Button variant="ghost" disabled={busy} onClick={() => void chooseDslrTemplate()}>
              Choose another file…
            </Button>
          }
          cancel={
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
          }
          primary={
            <Button
              variant="primary"
              data-autofocus
              onClick={() => void doImport()}
              disabled={busy}
            >
              {busy ? 'Importing…' : 'Import'}
            </Button>
          }
        />
      }
    >
      <div className="dslr-import">
        <OriginalPreview preview={p.preview} />
        <div className="dslr-import-body">
          <p className="import-found" data-testid="import-found">
            <Info size={16} aria-hidden="true" />
            <span>
              <strong>{found.headline}</strong> <span className="muted">{found.detail}</span>
            </span>
          </p>
          {choices.length > 0 && (
            <fieldset className="dslr-import-layouts" disabled={busy}>
              <legend>Open it as</legend>
              {choices.map((c) => (
                <label key={c.value} className="dslr-import-layout" data-layout={c.value}>
                  <input
                    type="radio"
                    name={`${id}-layout`}
                    value={c.value}
                    checked={layout === c.value}
                    onChange={() => setLayout(c.value)}
                  />
                  {c.value === 'strip' ? <OneStripArt /> : <WholeSheetArt />}
                  <span>
                    <span className="title">
                      {c.title}
                      {c.recommended && <span className="ui-badge tone-accent">Recommended</span>}
                    </span>
                    <span className="muted">{c.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <section className="import-for-you" aria-labelledby={`${id}-for-you`}>
            <h3 id={`${id}-for-you`} className="import-heading">
              For you
            </h3>
            {choices.length > 0 && <p className="import-meaning">{layoutMeaning(layout)}</p>}
            {notes.forYou.length > 0 && (
              <ul className="import-notes preflight-list">
                {notes.forYou.map((item) => (
                  <NoteRow key={item.code} item={item} />
                ))}
              </ul>
            )}
          </section>
          <details className="export-disclosure import-compat" id="import-compat">
            <summary>
              <ChevronRight size={15} aria-hidden="true" className="chev" />
              <span className="export-disclosure-title">Compatibility details</span>
              <span className="muted">
                {notes.technical.length === 1
                  ? '1 technical note'
                  : `${notes.technical.length} technical notes`}
              </span>
            </summary>
            <div className="export-disclosure-body">
              <dl className="dslr-import-facts">
                <dt>Template</dt>
                <dd>{p.templateName}</dd>
                <dt>Size</dt>
                <dd>{sizeLine}</dd>
                <dt>Photos</dt>
                <dd>{photosLine}</dd>
                <dt>Pictures</dt>
                <dd>{p.images}</dd>
              </dl>
              {notes.technical.length > 0 && (
                <ul className="import-notes preflight-list">
                  {notes.technical.map((item) => (
                    <NoteRow key={item.code} item={item} />
                  ))}
                </ul>
              )}
            </div>
          </details>
          {error && (
            <p className="export-error" role="alert">
              <CircleX size={14} aria-hidden="true" /> {error}
            </p>
          )}
        </div>
      </div>
    </Dialog>
  )
}

export function DslrImportDialog(): React.JSX.Element | null {
  const state = useLayout((s) => s.dslrImport)
  if (!state) return null
  if (state.kind === 'error') {
    const close = (): void => layoutStore.getState().setDslrImport(null)
    return (
      <Dialog
        title="This template could not be imported"
        onEscape={close}
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
            <Button variant="primary" data-autofocus onClick={() => void chooseDslrTemplate()}>
              Choose another…
            </Button>
          </>
        }
      >
        <p className="export-error" role="alert">
          <CircleX size={14} aria-hidden="true" /> {state.message}
        </p>
        <p className="muted">
          Choose the ZIP that dslrBooth made with its template Export button (it contains a file
          called template.xml).
        </p>
      </Dialog>
    )
  }
  // Keyed by token so choosing another file starts with that file's recommended layout.
  return <ImportForm key={state.preview.token} p={state.preview} />
}
