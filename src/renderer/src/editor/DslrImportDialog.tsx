import { CircleX, Info, TriangleAlert } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import type { DslrImportCheck, DslrImportLayout, DslrImportPreview } from '@shared/ipc'
import { guarded } from './commandRunner'
import { chooseDslrTemplate } from './dslrImportActions'
import { editorStore } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

const ICONS = { error: CircleX, warning: TriangleAlert, info: Info } as const

const inches = (n: number): string => String(Math.round(n * 100) / 100)

function CheckRow({ item }: { item: DslrImportCheck }): React.JSX.Element {
  const Icon = ICONS[item.severity]
  return (
    <li className={`preflight-item ${item.severity}`} data-code={item.code}>
      <Icon size={14} aria-hidden="true" />
      <span>
        <span className="sr-only">{item.severity}: </span>
        {item.message}
      </span>
    </li>
  )
}

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
      <figcaption>dslrBooth’s preview</figcaption>
    </figure>
  )
}

function ImportForm({ p }: { p: DslrImportPreview }): React.JSX.Element {
  const [layout, setLayout] = useState<DslrImportLayout>(p.recommendedLayout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const close = (): void => layoutStore.getState().setDslrImport(null)
  const checks = p.checks[layout] ?? []

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
      description={
        <>
          <span className="dslr-import-file">{p.fileName}</span> becomes a new Template Studio
          project. The ZIP itself is not changed.
        </>
      }
      width={720}
      onEscape={() => !busy && close()}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="footer-start"
            variant="ghost"
            disabled={busy}
            onClick={() => void chooseDslrTemplate()}
          >
            Choose another…
          </Button>
          <Button variant="primary" data-autofocus onClick={() => void doImport()} disabled={busy}>
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="dslr-import">
        <OriginalPreview preview={p.preview} />
        <div className="dslr-import-body">
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
          {p.twoUp && (
            <fieldset className="dslr-import-layouts" disabled={busy}>
              <legend>This sheet holds two strips side by side</legend>
              {(
                [
                  [
                    'strip',
                    `One ${inches(p.twoUp.stripWidthIn)}×${inches(p.twoUp.stripHeightIn)} strip, printed two per sheet`,
                    'Edit one strip; Template Studio and dslrBooth print the copy for you. Exports a native strip.'
                  ],
                  [
                    'as-is',
                    `The ${inches(p.widthIn)}×${inches(p.heightIn)} sheet exactly as it is`,
                    'Both strips stay separate layers; a change to one is not copied to the other.'
                  ]
                ] as const
              ).map(([value, title, hint]) => (
                <label key={value} className="dslr-import-layout" data-layout={value}>
                  <input
                    type="radio"
                    name={`${id}-layout`}
                    value={value}
                    checked={layout === value}
                    onChange={() => setLayout(value)}
                  />
                  <span>
                    <span className="title">
                      {title}
                      {p.recommendedLayout === value && (
                        <span className="ui-badge">Recommended</span>
                      )}
                    </span>
                    <span className="muted">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <section className="export-checks" aria-labelledby={`${id}-checks`}>
            <h3 id={`${id}-checks`}>What to know</h3>
            <ul className="preflight-list">
              {checks.map((item) => (
                <CheckRow key={item.code} item={item} />
              ))}
            </ul>
          </section>
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
