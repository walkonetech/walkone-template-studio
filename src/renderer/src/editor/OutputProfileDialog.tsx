import { useId, useRef, useState } from 'react'
import {
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FileText,
  Printer,
  TriangleAlert
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  BUILT_IN_PROFILES,
  CONFIDENCE_STEPS,
  CONFIDENCE_STEP_LABELS,
  EVIDENCE_HINTS,
  EVIDENCE_LABELS,
  formatMm,
  printerView,
  profileDesignSize,
  profileStatusLabel,
  type Evidence,
  type Measured,
  type OutputProfile,
  type PrinterSetupTile
} from '@output'
import { selectOutputProfile } from '@editor/store'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { useSafeAreaReport } from './SafeAreaOverlay'
import { Button } from '../ui/Button'
import { Dialog, DialogActions } from '../ui/Dialog'
import { EvidenceBadge, StatusBadge } from '../ui/Badge'
import { CornerArt, CutSheetArt } from './illustrations'

/**
 * Printer & cutting (Phase 7B B4, B1 mockup 09; the Output Profile of ADR-053 underneath, unchanged). Explains in
 * pictures what the printer may trim, what the safe line means, how sure we are and how to set up the booth PC.
 * The detailed evidence for every value stays one click away under "How do we know?" and is never summarised away.
 * The chosen printer is a setting of this computer, not of the project: it never marks the project Modified and is
 * never exported. No developer notes or repository paths appear here.
 */

const mm = (v: number | null): string => (v === null ? 'Unknown' : formatMm(v))

function Row({
  label,
  value,
  evidence,
  note
}: {
  label: string
  value: React.ReactNode
  evidence?: Evidence
  note?: string | undefined
}): React.JSX.Element {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {value} {evidence && <EvidenceBadge evidence={evidence} />}
        {note && <span className="profile-note">{note}</span>}
      </dd>
    </>
  )
}

function measuredText<T>(m: Measured<T>, show: (v: T) => string): string {
  return m.value === null ? 'Not known yet' : show(m.value)
}

/** "How do we know?": every value with its evidence (the authoritative model; nothing is collapsed into the meter). */
function Evidence({ p }: { p: OutputProfile }): React.JSX.Element {
  const cols = p.composition.mode === 'copies' ? p.composition.columns : 1
  const rows = p.composition.mode === 'copies' ? p.composition.rows : 1
  const copies = cols * rows
  return (
    <section
      className="profile-details"
      data-testid="output-profile-details"
      aria-label="The evidence behind each value"
    >
      <dl className="profile-facts">
        <Row
          label="Overall"
          value={<strong>{EVIDENCE_LABELS[p.confidence]}</strong>}
          evidence={p.confidence}
          note={EVIDENCE_HINTS[p.confidence]}
        />
        <Row
          label="Production booth"
          value={
            p.verifiedEnvironment
              ? `${p.verifiedEnvironment} (${p.verifiedDate})`
              : 'Not yet verified on a production booth'
          }
          evidence={p.verifiedEnvironment ? 'verified-production' : 'unknown'}
        />
        <Row
          label="Tested on"
          value={
            p.observedEnvironment
              ? `${p.observedEnvironment}${p.observedDate ? ` (${p.observedDate})` : ''}`
              : 'Not recorded'
          }
        />
        {p.device && (
          <>
            <Row label="Printer" value={`${p.device.manufacturer} ${p.device.model}`} />
            <Row
              label="Driver"
              value={measuredText(p.device.driverVersion, (v) => v)}
              evidence={p.device.driverVersion.evidence}
              note={p.device.driverVersion.note}
            />
          </>
        )}
        <Row
          label="Media"
          value={`${p.media.name}: ${p.media.nominalMm.width} × ${p.media.nominalMm.height} mm`}
          evidence="nominal"
        />
        <Row
          label="Driver page"
          value={measuredText(p.media.driverPageMm, (v) => `${v.width} × ${v.height} mm`)}
          evidence={p.media.driverPageMm.evidence}
          note={p.media.driverPageMm.note}
        />
        <Row
          label="Layout"
          value={
            copies > 1
              ? `${copies} copies of one ${profileDesignSize(p)} design on a ${p.sheet.widthIn}×${p.sheet.heightIn} in sheet`
              : `One ${p.sheet.widthIn}×${p.sheet.heightIn} in design`
          }
        />
        <Row
          label="Borderless"
          value={measuredText(p.borderless, (v) => (v ? 'Yes' : 'No'))}
          evidence={p.borderless.evidence}
          note={p.borderless.note}
        />
        {p.cuts.map((c) => (
          <Row
            key={c.id}
            label="Cut"
            value={`${c.label}: ${c.positionIn} in from the ${c.axis === 'x' ? 'left' : 'top'} edge`}
            evidence={c.evidence}
            note={c.note}
          />
        ))}
        {(['top', 'bottom', 'left', 'right', 'cut'] as const).map((k) => (
          <Row
            key={k}
            label={k === 'cut' ? 'Trim at the cut' : `Trim, ${k} edge`}
            value={mm(p.trimMm[k].value)}
            evidence={p.trimMm[k].evidence}
            note={k === 'top' || k === 'cut' ? p.trimMm[k].note : undefined}
          />
        ))}
        <Row
          label="Safe line, edges"
          value={mm(p.safeMarginMm.edge.value)}
          evidence={p.safeMarginMm.edge.evidence}
          note={p.safeMarginMm.edge.note}
        />
        <Row
          label="Safe line, cut"
          value={mm(p.safeMarginMm.cut.value)}
          evidence={p.safeMarginMm.cut.evidence}
        />
        <Row
          label="Auto-cut"
          value={measuredText(p.finishing.autoCut, (v) => v)}
          evidence={p.finishing.autoCut.evidence}
        />
        <Row
          label="Cut on seam"
          value={measuredText(p.finishing.cutOnSeam, (v) => v)}
          evidence={p.finishing.cutOnSeam.evidence}
        />
        <Row
          label="Gap at the cut"
          value={measuredText(p.finishing.gutter, (v) => v)}
          evidence={p.finishing.gutter.evidence}
        />
      </dl>
      {p.setup.length > 0 && (
        <>
          <h4>Full setup</h4>
          <ul className="profile-list">
            {p.setup.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {p.notes.length > 0 && (
        <>
          <h4>Notes</h4>
          <ul className="profile-list muted">
            {p.notes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

const TILE_ICON: Record<PrinterSetupTile['id'], LucideIcon> = {
  dslrbooth: FileText,
  printer: Printer,
  paper: FileText
}

/** The enlarged strip corner with its two labels (HTML, so they wrap and scale with the interface). */
function Corner({
  trimText,
  safeText,
  trimEstimated
}: {
  trimText: string | null
  safeText: string | null
  trimEstimated: boolean
}): React.JSX.Element {
  return (
    <figure className="printer-corner" data-testid="printer-diagram">
      <div className="printer-corner-art">
        <CornerArt />
        <span className="corner-label trim" data-testid="trim-label">
          May be cut off{trimText ? ` · ${trimText}` : ''}
          {trimText && trimEstimated ? ' (estimate)' : ''}
        </span>
        {safeText && (
          <span className="corner-label safe" data-testid="safe-label">
            Keep names and logos inside · {safeText}
          </span>
        )}
      </div>
      <figcaption>
        The corner of a strip, enlarged. Striped: may be cut off. Dashed: the safe line.
      </figcaption>
    </figure>
  )
}

function Meter({ view }: { view: ReturnType<typeof printerView> }): React.JSX.Element {
  const at = CONFIDENCE_STEPS.indexOf(view.readiness.step)
  return (
    <section className="printer-card printer-meter" aria-labelledby="printer-meter-title">
      <h3 id="printer-meter-title">How sure are we?</h3>
      <ol className="meter-steps" data-step={view.readiness.step}>
        {CONFIDENCE_STEPS.map((s, i) => (
          <li
            key={s}
            className={i <= at ? 'done' : ''}
            aria-current={i === at ? 'step' : undefined}
            data-step={s}
          >
            <span className="meter-bar" aria-hidden="true" />
            <span className="meter-label">{CONFIDENCE_STEP_LABELS[s]}</span>
          </li>
        ))}
      </ol>
      <p className="printer-meter-text">{view.meterText}</p>
      <p className="printer-production" data-testid="production-state">
        {view.productionVerified ? (
          <CircleCheck size={14} aria-hidden="true" />
        ) : (
          <CircleHelp size={14} aria-hidden="true" />
        )}
        {view.productionText}
      </p>
    </section>
  )
}

function PrinterBody({
  p,
  showSafeAreas
}: {
  p: OutputProfile
  showSafeAreas: boolean
}): React.JSX.Element {
  const view = printerView(p)
  return (
    <div className="printer-layout">
      <div className="printer-col">
        <Corner
          trimText={view.trimText}
          safeText={view.safeText}
          trimEstimated={view.trimEstimated}
        />
        {view.copies > 1 && (
          <div className="printer-sheet">
            <CutSheetArt cut={view.cut} />
            <p>
              {view.copies === 2 ? 'Two strips' : `${view.copies} copies`} per sheet.
              {view.cut ? ' The printer cuts them apart down the middle.' : ''}
            </p>
          </div>
        )}
        <label className="profile-toggle">
          <input
            type="checkbox"
            id="safe-areas-toggle"
            checked={showSafeAreas}
            onChange={(e) => editorStore.getState().setShowSafeAreas(e.target.checked)}
          />
          Show the cut-off band and the safe line on the canvas
        </label>
      </div>
      <div className="printer-col">
        <Meter view={view} />
        <section aria-labelledby="printer-setup-title" className="printer-setup">
          <h3 id="printer-setup-title">Set up the booth PC</h3>
          <ol className="setup-tiles">
            {view.tiles.map((t, i) => {
              const Icon = TILE_ICON[t.id]
              return (
                <li key={t.id} className="setup-tile" data-tile={t.id}>
                  <span className="setup-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="setup-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.6} />
                  </span>
                  <span className="setup-text">
                    <strong>{t.title}</strong>
                    <span>{t.text}</span>
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="muted printer-never">
            Template Studio shows the guides. It never changes printer settings, and nothing about
            the printer goes into exported files.
          </p>
        </section>
        <details className="export-disclosure printer-evidence" id="printer-evidence">
          <summary>
            <ChevronRight size={15} aria-hidden="true" className="chev" />
            <span className="export-disclosure-title">How do we know?</span>
            <span className="muted">The evidence behind each value</span>
          </summary>
          <div className="export-disclosure-body">
            <Evidence p={p} />
          </div>
        </details>
      </div>
    </div>
  )
}

function OutputProfileForm(): React.JSX.Element {
  const selected = useEditor(selectOutputProfile)
  const showSafeAreas = useEditor((s) => s.showSafeAreas)
  const report = useSafeAreaReport()
  const name = useId()
  const [choosing, setChoosing] = useState(false)
  const chooser = useRef<HTMLDetailsElement>(null)
  const close = (): void => layoutStore.getState().setOutputProfileOpen(false)
  const choose = (id: string | null): void => {
    const s = editorStore.getState()
    s.setOutputProfile(id)
    // Choosing a printer is asking to see its safe areas.
    if (id !== null) s.setShowSafeAreas(true)
  }
  const options: { id: string | null; title: string; detail: string }[] = [
    {
      id: null,
      title: 'No printer',
      detail: 'Edit and export as usual. The cut-off band and safe line are not shown or checked.'
    },
    ...BUILT_IN_PROFILES.map((p) => ({ id: p.id, title: p.name, detail: profileStatusLabel(p) }))
  ]
  const flagged = report?.flagged.length ?? 0
  const readiness = selected ? printerView(selected).readiness : null
  const openChooser = (): void => {
    setChoosing(true)
    requestAnimationFrame(() => {
      chooser.current?.scrollIntoView({ block: 'nearest' })
      chooser.current?.querySelector<HTMLInputElement>('input:checked')?.focus()
    })
  }
  // The printer choice: open when none is chosen; otherwise behind "Change printer…" (below the explanation).
  const chooserView = (
    <details
      className="export-disclosure printer-choose"
      ref={chooser}
      open={!selected || choosing}
      onToggle={(e) => setChoosing(e.currentTarget.open)}
    >
      <summary>
        <ChevronRight size={15} aria-hidden="true" className="chev" />
        <span className="export-disclosure-title">Printer</span>
        <span className="muted">{selected ? selected.name : 'None chosen'}</span>
      </summary>
      <fieldset className="export-outputs profile-choices export-disclosure-body">
        <legend className="sr-only">Printer</legend>
        {options.map((o) => {
          const id = `${name}-${o.id ?? 'none'}`
          return (
            <div key={id} className="export-output" data-profile={o.id ?? 'none'}>
              <input
                type="radio"
                id={id}
                name={name}
                checked={(selected?.id ?? null) === o.id}
                onChange={() => choose(o.id)}
              />
              <label htmlFor={id}>
                <span className="title">{o.title}</span>
                <span className="muted">{o.detail}</span>
              </label>
            </div>
          )
        })}
      </fieldset>
    </details>
  )
  return (
    <Dialog
      title={selected ? `Printer & cutting · ${selected.shortName}` : 'Printer & cutting'}
      description={
        selected ? (
          <>
            {printerView(selected).subtitle}
            {readiness && (
              <span className="printer-ready" data-testid="printer-readiness">
                <StatusBadge tone={readiness.ready ? 'ready' : 'attention'}>
                  {readiness.label}
                </StatusBadge>
              </span>
            )}
          </>
        ) : (
          'Choose the printer this design is checked against. A setting on this computer: it is not saved in the project and never goes into exported files.'
        )
      }
      onEscape={close}
      size="xl"
      testId="printer-dialog"
      footer={
        <DialogActions
          start={
            selected && report ? (
              <span className="printer-project" id="safe-area-summary">
                This project:{' '}
                {flagged > 0 ? (
                  <span className="tone-attention">
                    <TriangleAlert size={14} aria-hidden="true" />
                    {flagged === 1 ? '1 item near an edge' : `${flagged} items near an edge`}
                  </span>
                ) : (
                  <span className="tone-ready">
                    <CircleCheck size={14} aria-hidden="true" />
                    everything important is inside
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    close()
                    layoutStore.getState().setExportOpen(false)
                    layoutStore.getState().setChecksOpen(true)
                  }}
                >
                  Open Checks
                </Button>
              </span>
            ) : undefined
          }
          cancel={
            selected ? (
              <Button variant="ghost" onClick={openChooser} data-testid="change-printer">
                Change printer…
              </Button>
            ) : undefined
          }
          primary={
            <Button variant="primary" data-autofocus onClick={close}>
              Done
            </Button>
          }
        />
      }
    >
      {!selected && chooserView}
      {selected && <PrinterBody p={selected} showSafeAreas={showSafeAreas} />}
      {selected && chooserView}
    </Dialog>
  )
}

export function OutputProfileDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.outputProfileOpen)
  const hasProject = useEditor((s) => s.project !== null)
  if (!open || !hasProject) return null
  return <OutputProfileForm />
}
