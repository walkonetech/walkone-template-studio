import { ChevronRight, CircleCheck, CircleX, FileText, FolderOpen, Printer } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { TemplateProject } from '@domain'
import type { ExportFile, ExportWriteResult } from '@shared/ipc'
import { buildChecks, exportReadiness, type CheckInput } from '@editor/checks'
import {
  cardState,
  exportButtonLabel,
  exportCards,
  filesSummary,
  firstUseSelection,
  toggleCard,
  type ExportCardId
} from '@editor/exportCards'
import { hasDerivedCopies } from '@canvas/rendering/composition'
import { describeSize } from '@editor/exportPlan'
import { runExportPreflight, type ExportPreflight } from '@editor/exportPreflight'
import { isDslrKind } from '@export/dslrbooth/outputs'
import { runDslrPreflight } from '@export/dslrbooth/preflight'
import { formatCheckItems } from '@export/formatChecks'
import type { ExportKind } from '@export/naming'
import { profileReadiness } from '@output'
import { editorStore, useEditor } from './editorStore'
import {
  allExportOutputs,
  loadExportImages,
  renderExports,
  type ExportProgress
} from './exportActions'
import { fontEnvironment } from './fontCatalog'
import { layoutStore, useLayout } from './layoutStore'
import { isMac } from './platform'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { CheckGroups, CheckCounts, TONE_ICON, selectCheckLayers } from './CheckList'
import { BoothArt, PrintArt, ProofArt } from './illustrations'
import { useSafeAreaReport } from './SafeAreaOverlay'

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

const CARD_ART: Record<ExportCardId, () => React.JSX.Element> = {
  booth: BoothArt,
  print: PrintArt,
  proof: ProofArt
}

const inches = (n: number): string => String(Math.round(n * 100) / 100)

/** "2×6 strip" / "4×6 print": what the project is, for the dialog subtitle. */
function formatLine(project: TemplateProject): string {
  const d = project.canvas.print
  const isStrip = Math.min(d.width, d.height) === 2 && Math.max(d.width, d.height) === 6
  return `${inches(d.width)}×${inches(d.height)} ${hasDerivedCopies(project) ? (isStrip ? 'strip' : 'design') : 'print'}`
}

/** Printer chip in the pinned summary: which printer the checks use, and how sure we are. Opens Printer & cutting. */
function PrinterChip({
  report
}: {
  report: ReturnType<typeof useSafeAreaReport>
}): React.JSX.Element | null {
  if (!report) return null
  const r = report.resolution
  let text: string
  let state: string
  if (r.status === 'none') {
    text = 'No printer chosen'
    state = 'none'
  } else if (r.status === 'mismatch') {
    text = `${r.profile.shortName} · doesn’t match`
    state = 'mismatch'
  } else {
    const step = profileReadiness(r.profile.confidence).step
    text = `${r.profile.shortName} · ${step === 'tested' ? 'Tested' : step === 'measured' ? 'Measured' : 'Estimated'}`
    state = step
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={Printer}
      className="export-printer"
      data-testid="export-output-profile"
      data-state={state}
      aria-label={`Printer & cutting: ${text}`}
      onClick={() => layoutStore.getState().setOutputProfileOpen(true)}
    >
      <span>{text}</span>
    </Button>
  )
}

function ExportForm({
  project,
  sessionId
}: {
  project: TemplateProject
  sessionId: string
}): React.JSX.Element {
  const outputs = useMemo(() => allExportOutputs(project), [project])
  const cards = useMemo(() => exportCards(outputs), [outputs])
  const dslrCheck = useMemo(() => runDslrPreflight(project), [project])
  // First use (owner decision R2): For the booth only. Dialog state; never stored in the project.
  const [selected, setSelected] = useState<ExportKind[]>(() => firstUseSelection(outputs))
  const [preflight, setPreflight] = useState<ExportPreflight | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'setup' })
  const [checksOpen, setChecksOpen] = useState(false)
  const checksRef = useRef<HTMLDetailsElement>(null)
  const listId = useId()
  // Printer (Output Profile, ADR-053): its safe-area checks join the list; they never block the export, and nothing
  // from the profile is written into any exported file.
  const safeReport = useSafeAreaReport()
  const close = (): void => layoutStore.getState().setExportOpen(false)

  // Each phase swaps the dialog's controls; put focus back on its primary action so keyboard users are never left on
  // <body> (the Export button is disabled while work runs, which drops focus).
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
  const dslrSelected = selected.some(isDslrKind)
  // dslrBooth checks only matter (and only block) when a dslrBooth template is selected. One Checks model for the
  // panel and this dialog: the same finding reads the same in both.
  const inputs: CheckInput[] =
    preflight === null
      ? []
      : [
          ...(dslrSelected ? dslrCheck.items : []),
          ...preflight.items,
          // "No printer chosen" is said by the printer chip; it is not a finding about the design.
          ...(safeReport?.items ?? []).filter((i) => i.code !== 'output-profile-none'),
          ...formatCheckItems(project, {
            hasOutputProfile: safeReport?.resolution.status !== 'none'
          })
        ]
  const checks = buildChecks(inputs)
  const blocked =
    preflight !== null && (!preflight.canExport || (dslrSelected && !dslrCheck.canExport))
  const files = filesSummary(outputs, selected)
  // Errors open the checks by themselves; notes stay quiet until asked for.
  const showChecks = checksOpen || checks.errors > 0
  const review = (): void => {
    setChecksOpen(true)
    requestAnimationFrame(() =>
      checksRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    )
  }
  const handlers = {
    onSelect: (ids: readonly string[]) => {
      // Fixing happens in the editor: close Export, show the Checks panel and select the layers.
      close()
      layoutStore.getState().setChecksOpen(true)
      selectCheckLayers(ids)
    },
    onPrinter: () => layoutStore.getState().setOutputProfileOpen(true)
  }

  let footer: React.ReactNode
  let body: React.ReactNode
  let summary: React.ReactNode = null

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
    const ready = preflight === null ? null : exportReadiness(checks)
    const ReadyIcon = ready ? TONE_ICON[ready.tone] : CircleCheck
    const firstProblem = checks.groups.find((g) => g.severity !== 'info')?.cards[0]
    summary = (
      <div
        className={`export-summary tone-${ready?.tone ?? 'pending'}`}
        data-testid="export-summary"
      >
        <span className="export-summary-icon" aria-hidden="true">
          <ReadyIcon size={20} strokeWidth={2} />
        </span>
        <div className="export-summary-text">
          <strong id="export-readiness">{ready ? ready.text : 'Checking the design…'}</strong>
          {firstProblem && (
            <span className="muted">
              {firstProblem.title}.{checks.errors === 0 ? ' You can still export.' : ''}
            </span>
          )}
        </div>
        {ready && ready.tone !== 'ready' && (
          <Button size="sm" onClick={review} data-testid="export-review">
            Review
          </Button>
        )}
        <PrinterChip report={safeReport} />
      </div>
    )
    body = (
      <>
        <section className="export-cards-section" aria-labelledby={`${listId}-what`}>
          <h3 id={`${listId}-what`} className="export-heading">
            What do you need?
          </h3>
          <div className="export-cards" role="group" aria-labelledby={`${listId}-what`}>
            {cards.map((card) => {
              const state = cardState(card, selected)
              const Art = CARD_ART[card.id]
              return (
                <button
                  key={card.id}
                  type="button"
                  role="checkbox"
                  aria-checked={state === 'on' ? true : state === 'off' ? false : 'mixed'}
                  className={`export-card ${state}`}
                  data-card={card.id}
                  disabled={working}
                  aria-describedby={`${listId}-${card.id}-desc`}
                  onClick={() => setSelected((s) => toggleCard(card, s))}
                >
                  <span className="export-card-art">
                    <Art />
                    <span className="export-card-check" aria-hidden="true">
                      {state !== 'off' && <CircleCheck size={18} strokeWidth={2.2} />}
                    </span>
                  </span>
                  <span className="export-card-title">{card.title}</span>
                  <span className="export-card-desc" id={`${listId}-${card.id}-desc`}>
                    {card.description}
                  </span>
                </button>
              )
            })}
          </div>
          <p
            id="export-files-summary"
            className={`export-files-line${files.count === 0 ? ' empty' : ''}`}
          >
            <FileText size={15} aria-hidden="true" />
            <span>
              {files.text}
              {files.count > 0 && <span className="muted">: {files.names.join(' · ')}</span>}
            </span>
          </p>
        </section>
        <details
          className="export-disclosure export-checks"
          id="export-checks"
          ref={checksRef}
          open={showChecks}
          onToggle={(e) => setChecksOpen(e.currentTarget.open)}
        >
          <summary>
            <ChevronRight size={15} aria-hidden="true" className="chev" />
            <span className="export-disclosure-title">Checks</span>
            <span id="preflight-summary" className={blocked ? 'blocked' : ''}>
              {preflight === null ? 'Checking the design…' : checks.headline.text}
              {blocked && ' · Fix the errors before exporting.'}
            </span>
          </summary>
          <div className="export-disclosure-body">
            {preflight !== null && (
              <>
                <CheckCounts model={checks} />
                <CheckGroups model={checks} handlers={handlers} />
              </>
            )}
          </div>
        </details>
        <details className="export-disclosure export-more" id="export-more">
          <summary>
            <ChevronRight size={15} aria-hidden="true" className="chev" />
            <span className="export-disclosure-title">More options</span>
            <span className="muted">
              {outputs.some((o) => o.kind === 'dslrbooth-4x6')
                ? '4×6 dslrBooth template · single files · file names'
                : 'Single files · file names'}
            </span>
          </summary>
          <fieldset className="export-outputs export-disclosure-body" disabled={working}>
            <legend className="sr-only">Files</legend>
            {outputs.map((o, i) => {
              const id = `${listId}-${o.kind}`
              const group = isDslrKind(o.kind) ? 'For dslrBooth' : 'Images'
              const prev = outputs[i - 1]
              const heading =
                !prev || isDslrKind(prev.kind) !== isDslrKind(o.kind) ? (
                  <div className="export-group">{group}</div>
                ) : null
              return (
                <div key={o.kind} className="export-output-wrap">
                  {heading}
                  <div className="export-output" data-kind={o.kind}>
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
                </div>
              )
            })}
            <p className="muted export-names-note">
              File names come from the project name. Rename the project to change them.
            </p>
          </fieldset>
        </details>
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
      <DialogActions
        start={
          <span className="export-folder">
            <FolderOpen size={15} aria-hidden="true" />
            You choose the folder next
          </span>
        }
        cancel={
          <Button variant="ghost" onClick={close} disabled={working}>
            Cancel
          </Button>
        }
        primary={
          <Button
            variant="primary"
            data-autofocus
            id="export-start"
            disabled={working || preflight === null || blocked || selected.length === 0}
            onClick={() => void start()}
          >
            {exportButtonLabel(files.count)}
          </Button>
        }
      />
    )
  }

  return (
    <Dialog
      title="Export"
      description={`${project.metadata.name || 'Untitled'} · ${formatLine(project)}`}
      onEscape={working ? () => undefined : close}
      footer={footer}
      summary={summary}
      size="lg"
      testId="export-dialog"
    >
      {body}
    </Dialog>
  )
}

/** The Export dialog (6A; B4 picture cards): choose what you need, review checks, pick a folder, write, reveal. */
export function ExportDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.exportOpen)
  const project = useEditor((s) => s.project)
  const sessionId = useEditor((s) => s.session?.sessionId ?? null)
  if (!open || !project || !sessionId) return null
  return <ExportForm project={project} sessionId={sessionId} />
}
