import { useId } from 'react'
import {
  BUILT_IN_PROFILES,
  EVIDENCE_HINTS,
  EVIDENCE_LABELS,
  formatMm,
  isVerifiedEvidence,
  profileDesignSize,
  profileStatusLabel,
  type Evidence,
  type Measured,
  type OutputProfile
} from '@output'
import { selectOutputProfile } from '@editor/store'
import { editorStore, useEditor } from './editorStore'
import { layoutStore, useLayout } from './layoutStore'
import { PreflightRow, checkSummary } from './CheckList'
import { useSafeAreaReport } from './SafeAreaOverlay'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'

/**
 * View › Output profile… (ADR-053): choose the profile used for safe areas and checks, and read what each of its
 * values rests on. The choice is a setting of this computer, not of the project: it never marks the project Modified
 * and is never exported.
 */

function EvidenceBadge({ e }: { e: Evidence }): React.JSX.Element {
  const tone = isVerifiedEvidence(e) ? 'ok' : e === 'unknown' ? 'muted' : 'warn'
  return (
    <span className={`ui-badge evidence ${tone}`} title={EVIDENCE_HINTS[e]} data-evidence={e}>
      {EVIDENCE_LABELS[e]}
    </span>
  )
}

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
        {value} {evidence && <EvidenceBadge e={evidence} />}
        {note && <span className="profile-note">{note}</span>}
      </dd>
    </>
  )
}

function measuredText<T>(m: Measured<T>, show: (v: T) => string): string {
  return m.value === null ? 'Awaiting readout' : show(m.value)
}

function ProfileDetails({ p }: { p: OutputProfile }): React.JSX.Element {
  const cols = p.composition.mode === 'copies' ? p.composition.columns : 1
  const rows = p.composition.mode === 'copies' ? p.composition.rows : 1
  const copies = cols * rows
  return (
    <section
      className="profile-details"
      data-testid="output-profile-details"
      aria-label="Profile details"
    >
      <p className="muted">{p.description}</p>
      <dl className="profile-facts">
        <Row
          label="Status"
          value={<strong>{EVIDENCE_LABELS[p.confidence]}</strong>}
          note={EVIDENCE_HINTS[p.confidence]}
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
          label="Keep-safe, edges"
          value={mm(p.safeMarginMm.edge.value)}
          evidence={p.safeMarginMm.edge.evidence}
          note={p.safeMarginMm.edge.note}
        />
        <Row
          label="Keep-safe, cut"
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
          label="Gutter"
          value={measuredText(p.finishing.gutter, (v) => v)}
          evidence={p.finishing.gutter.evidence}
        />
        <Row
          label="Observed"
          value={
            p.observedEnvironment
              ? `${p.observedEnvironment}${p.observedDate ? ` (${p.observedDate})` : ''}`
              : 'Not recorded'
          }
        />
        <Row
          label="Verified"
          value={
            p.verifiedEnvironment
              ? `${p.verifiedEnvironment} (${p.verifiedDate})`
              : 'Not yet verified on a production booth'
          }
        />
      </dl>
      {p.setup.length > 0 && (
        <>
          <h4>Printer setup</h4>
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

function OutputProfileForm(): React.JSX.Element {
  const selected = useEditor(selectOutputProfile)
  const showSafeAreas = useEditor((s) => s.showSafeAreas)
  const report = useSafeAreaReport()
  const name = useId()
  const close = (): void => layoutStore.getState().setOutputProfileOpen(false)
  const choose = (id: string | null): void => {
    const s = editorStore.getState()
    s.setOutputProfile(id)
    // Choosing a profile is asking to see its safe areas.
    if (id !== null) s.setShowSafeAreas(true)
  }
  const options: { id: string | null; title: string; detail: string }[] = [
    {
      id: null,
      title: 'No profile',
      detail: 'Edit and export as usual. Printer safe areas are not shown or checked.'
    },
    ...BUILT_IN_PROFILES.map((p) => ({ id: p.id, title: p.name, detail: profileStatusLabel(p) }))
  ]
  return (
    <Dialog
      title="Output profile"
      description="The printer and media this design is checked against. A setting on this computer: it is not saved in the project and never goes into exported files."
      onEscape={close}
      width={640}
      footer={
        <Button variant="primary" data-autofocus onClick={close}>
          Done
        </Button>
      }
    >
      <fieldset className="export-outputs profile-choices">
        <legend>Profile</legend>
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
      {selected && (
        <>
          <label className="profile-toggle">
            <input
              type="checkbox"
              id="safe-areas-toggle"
              checked={showSafeAreas}
              onChange={(e) => editorStore.getState().setShowSafeAreas(e.target.checked)}
            />
            Show safe areas on the canvas
          </label>
          <ProfileDetails p={selected} />
        </>
      )}
      {report && (
        <section className="export-checks" aria-label="Safe-area check">
          <h3>This project</h3>
          <p id="safe-area-summary">{checkSummary(report.items)}</p>
          <ul className="preflight-list">
            {report.items.map((item, i) => (
              <PreflightRow key={`${item.code}-${i}`} item={item} />
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  )
}

export function OutputProfileDialog(): React.JSX.Element | null {
  const open = useLayout((s) => s.outputProfileOpen)
  const hasProject = useEditor((s) => s.project !== null)
  if (!open || !hasProject) return null
  return <OutputProfileForm />
}
