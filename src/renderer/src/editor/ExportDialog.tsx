import { CircleCheck, CircleX, FolderOpen, Info, TriangleAlert } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import type { TemplateProject } from '@domain'
import type { ExportFile, ExportWriteResult } from '@shared/ipc'
import { describeSize, exportOutputs } from '@editor/exportPlan'
import {
  runExportPreflight,
  type ExportPreflight,
  type PreflightItem
} from '@editor/exportPreflight'
import type { ExportKind } from '@export/naming'
import { editorStore, useEditor } from './editorStore'
import { loadExportImages, renderExports, type ExportProgress } from './exportActions'
import { fontEnvironment } from './fontCatalog'
import { layoutStore, useLayout } from './layoutStore'
import { isMac } from './platform'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

type Phase =
  | { kind: 'setup' }
  | { kind: 'working'; progress: ExportProgress }
  | {
      kind: 'conflict'
      destinationId: string
      folderName: string
      existing: string[]
      files: ExportFile[]
    }
  | {
      kind: 'done'
      destinationId: string
      result: Extract<ExportWriteResult, { outcome: 'written' }>
    }
  | { kind: 'error'; message: string }

const formatBytes = (n: number): string =>
  n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`

const ICONS = { error: CircleX, warning: TriangleAlert, info: Info } as const

function PreflightRow({ item }: { item: PreflightItem }): React.JSX.Element {
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

function summary(p: ExportPreflight): string {
  if (p.items.length === 0) return 'No problems found.'
  const parts = [
    p.errors ? `${p.errors} ${p.errors === 1 ? 'error' : 'errors'}` : '',
    p.warnings ? `${p.warnings} ${p.warnings === 1 ? 'warning' : 'warnings'}` : '',
    p.infos ? `${p.infos} ${p.infos === 1 ? 'note' : 'notes'}` : ''
  ].filter(Boolean)
  return parts.join(' · ')
}

function ExportForm({
  project,
  sessionId
}: {
  project: TemplateProject
  sessionId: string
}): React.JSX.Element {
  const outputs = useMemo(() => exportOutputs(project), [project])
  const [selected, setSelected] = useState<ExportKind[]>(() =>
    outputs.filter((o) => o.defaultSelected).map((o) => o.kind)
  )
  const [preflight, setPreflight] = useState<ExportPreflight | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const listId = useId()
  const close = (): void => layoutStore.getState().setExportOpen(false)

  // Each phase swaps the dialog's controls; put focus back on its primary action so keyboard users are never left on
  // <body> (the Export… button is disabled while work runs, which drops focus).
  useEffect(() => {
    if (phase.kind === 'working') return
    document.querySelector<HTMLElement>('[role=dialog] [data-autofocus]:not(:disabled)')?.focus()
  }, [phase.kind, preflight])

  useEffect(() => {
    let live = true
    void loadExportImages(project, sessionId).then((unreadable) => {
      if (live)
        setPreflight(
          runExportPreflight(project, { fonts: fontEnvironment(), unreadableAssetIds: unreadable })
        )
    })
    return () => {
      live = false
    }
  }, [project, sessionId])

  const toggle = (k: ExportKind): void =>
    setSelected((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]))

  const write = async (
    destinationId: string,
    files: ExportFile[],
    onConflict: 'ask' | 'replace' | 'keep-both',
    folderName: string
  ): Promise<void> => {
    setPhase({ kind: 'working', progress: { label: 'Writing files', done: 1, total: 1 } })
    const r = await window.api.export.write({ destinationId, files, onConflict })
    if (r.status === 'error') return setPhase({ kind: 'error', message: r.error.message })
    if (r.status === 'cancelled') return setPhase({ kind: 'setup' })
    if (r.value.outcome === 'conflict')
      return setPhase({
        kind: 'conflict',
        destinationId,
        folderName,
        existing: r.value.existing,
        files
      })
    setPhase({ kind: 'done', destinationId, result: r.value })
    const n = r.value.written.length
    editorStore
      .getState()
      .setMessage(
        r.value.failed.length > 0
          ? `Exported ${n} of ${n + r.value.failed.length} files to “${r.value.folderName}”.`
          : `Exported ${n} ${n === 1 ? 'file' : 'files'} to “${r.value.folderName}”.`
      )
  }

  const start = async (): Promise<void> => {
    const dest = await window.api.export.chooseDestination()
    if (dest.status === 'cancelled') return
    if (dest.status === 'error') return setPhase({ kind: 'error', message: dest.error.message })
    const order = outputs.map((o) => o.kind).filter((k) => selected.includes(k))
    let files: ExportFile[]
    try {
      setPhase({ kind: 'working', progress: { label: 'Preparing', done: 0, total: 1 } })
      files = await renderExports(project, sessionId, order, (progress) =>
        setPhase({ kind: 'working', progress })
      )
    } catch (e) {
      return setPhase({
        kind: 'error',
        message: e instanceof Error ? `Rendering failed: ${e.message}` : 'Rendering failed.'
      })
    }
    await write(dest.value.destinationId, files, 'ask', dest.value.folderName)
  }

  const reveal = (destinationId: string, name: string): void => {
    void window.api.export.reveal({ destinationId, name })
  }

  const working = phase.kind === 'working'
  const blocked = preflight !== null && !preflight.canExport
  let footer: React.ReactNode
  let body: React.ReactNode

  if (phase.kind === 'conflict') {
    body = (
      <div className="export-conflict" role="alert">
        <p>
          {phase.existing.length === 1
            ? 'A file with this name already exists'
            : 'Files with these names already exist'}{' '}
          in “{phase.folderName}”:
        </p>
        <ul className="export-files">
          {phase.existing.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="muted">
          Replace overwrites them. Keep both saves the new files with a number added.
        </p>
      </div>
    )
    footer = (
      <>
        <Button
          variant="ghost"
          className="footer-start"
          onClick={() => setPhase({ kind: 'setup' })}
        >
          Cancel
        </Button>
        <Button
          onClick={() =>
            void write(phase.destinationId, phase.files, 'keep-both', phase.folderName)
          }
        >
          Keep both
        </Button>
        <Button
          variant="primary"
          data-autofocus
          onClick={() => void write(phase.destinationId, phase.files, 'replace', phase.folderName)}
        >
          Replace
        </Button>
      </>
    )
  } else if (phase.kind === 'done') {
    const { result, destinationId } = phase
    body = (
      <div className="export-done">
        <p id="export-result" role="status">
          <CircleCheck size={15} aria-hidden="true" className="ok" /> Exported{' '}
          {result.written.length} {result.written.length === 1 ? 'file' : 'files'} to “
          {result.folderName}”.
        </p>
        <ul className="export-files">
          {result.written.map((f) => (
            <li key={f.name} data-name={f.name}>
              <span className="name">{f.name}</span>
              <span className="muted">{formatBytes(f.bytes)}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={FolderOpen}
                onClick={() => reveal(destinationId, f.name)}
              >
                {isMac() ? 'Show in Finder' : 'Show in Explorer'}
              </Button>
            </li>
          ))}
        </ul>
        {result.failed.length > 0 && (
          <ul className="preflight-list" role="alert">
            {result.failed.map((f) => (
              <li key={f.name} className="preflight-item error">
                <CircleX size={14} aria-hidden="true" />
                <span>
                  {f.name}: {f.error.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
    footer = (
      <Button variant="primary" data-autofocus onClick={close}>
        Done
      </Button>
    )
  } else {
    body = (
      <>
        <fieldset className="export-outputs" disabled={working}>
          <legend>Files</legend>
          {outputs.map((o) => {
            const id = `${listId}-${o.kind}`
            return (
              <div key={o.kind} className="export-output" data-kind={o.kind}>
                <input
                  type="checkbox"
                  id={id}
                  checked={selected.includes(o.kind)}
                  onChange={() => toggle(o.kind)}
                  aria-describedby={`${id}-desc`}
                />
                <label htmlFor={id}>
                  <span className="title">
                    {o.label}
                    {!o.production && <span className="ui-badge warn">Not for printing</span>}
                  </span>
                  <span className="file">{o.fileName}</span>
                  <span className="muted" id={`${id}-desc`}>
                    {o.description} {describeSize(o)}
                  </span>
                </label>
              </div>
            )
          })}
        </fieldset>
        <section className="export-checks" aria-labelledby={`${listId}-checks`}>
          <h3 id={`${listId}-checks`}>Checks</h3>
          {preflight === null ? (
            <p className="muted">Checking the design…</p>
          ) : (
            <>
              <p id="preflight-summary" className={blocked ? 'blocked' : ''}>
                {summary(preflight)}
                {blocked && ' Fix the errors before exporting.'}
              </p>
              {preflight.items.length > 0 && (
                <ul className="preflight-list">
                  {preflight.items.map((item) => (
                    <PreflightRow key={item.code} item={item} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
        {phase.kind === 'working' && (
          <div className="export-progress" role="status" aria-live="polite">
            <span>{phase.progress.label}…</span>
            <progress max={phase.progress.total} value={phase.progress.done} />
          </div>
        )}
        {phase.kind === 'error' && (
          <p className="export-error" role="alert">
            <CircleX size={14} aria-hidden="true" /> {phase.message}
          </p>
        )}
      </>
    )
    footer = (
      <>
        <Button variant="ghost" onClick={close} disabled={working}>
          Cancel
        </Button>
        <Button
          variant="primary"
          data-autofocus
          id="export-start"
          disabled={working || preflight === null || blocked || selected.length === 0}
          onClick={() => void start()}
        >
          Export…
        </Button>
      </>
    )
  }

  return (
    <Dialog
      title="Export"
      description="Render print-ready files from this project. The project itself is not changed."
      onEscape={working ? () => undefined : close}
      footer={footer}
      width={620}
    >
      {body}
    </Dialog>
  )
}

/** The Export dialog (Phase 6A): choose outputs, review preflight, pick a folder, write, reveal. */
export function ExportDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.exportOpen)
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  if (!open || !project || !sessionId) return null
  return <ExportForm project={project} sessionId={sessionId} />
}
