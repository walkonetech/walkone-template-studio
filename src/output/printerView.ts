import { confidenceStep, profileReadiness, type ConfidenceStep } from './evidenceTier'
import { profileDesignSize, type OutputProfile } from './profile'
import { formatMm } from './units'

/**
 * The plain-language "Printer & cutting" reading of an Output Profile (Phase 7B B4, B1 mockup 09). A PRESENTATION of
 * the profile: it derives everything from the profile's own data and never changes it, and it never upgrades the
 * evidence. The friendly 3-step meter summarises the profile's overall confidence; the per-value evidence stays the
 * authority (shown under "How do we know?"). "Measured" never means "verified on the production booth": production
 * verification is reported separately and only from `verifiedEnvironment`.
 */

export interface PrinterSetupTile {
  id: 'dslrbooth' | 'printer' | 'paper'
  title: string
  text: string
}

export interface PrinterView {
  /** "6×4 (PC) paper · two 2×6 strips per sheet, cut apart by the printer" */
  subtitle: string
  readiness: { ready: boolean; label: string; step: ConfidenceStep }
  /** What the current meter step means, in one or two sentences. */
  meterText: string
  /** "about 1.6–1.8 mm" (estimated loss at the edges), or null when unknown. */
  trimText: string | null
  /** True when every edge trim value is an estimate (inferred / provisional), i.e. not measured. */
  trimEstimated: boolean
  /** "3 mm", or null when the profile gives no keep-safe guidance. */
  safeText: string | null
  tiles: PrinterSetupTile[]
  /** Only true when the profile records a production-booth verification. */
  productionVerified: boolean
  productionText: string
  copies: number
  cut: boolean
}

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] as const

const METER_TEXT: Readonly<Record<ConfidenceStep, string>> = {
  estimated:
    'Estimated from the printer’s settings. It has not been tested on a print yet, so treat the safe line as a guess.',
  tested:
    'A real print looked right. The trim was not measured exactly, so the safe line stays as a safety margin.',
  measured:
    'Measured on a physical print. This is not the same as verified on the production booth PC.'
}

export function printerView(p: OutputProfile): PrinterView {
  const readiness = profileReadiness(p.confidence)
  const copies = p.composition.mode === 'copies' ? p.composition.columns * p.composition.rows : 1
  const design = profileDesignSize(p)
  const cut = p.cuts.length > 0
  const subtitle =
    copies > 1
      ? `${p.media.name} paper · ${WORDS[copies] ?? copies} ${design} strips per sheet${cut ? ', cut apart by the printer' : ''}`
      : `${p.media.name} paper · one ${design} design per sheet`

  const edges = (['top', 'bottom', 'left', 'right'] as const).map((k) => p.trimMm[k])
  const known = edges.filter((t) => t.value !== null).map((t) => t.value as number)
  const lo = Math.min(...known)
  const hi = Math.max(...known)
  const trimText =
    known.length === 0 ? null : lo === hi ? `about ${formatMm(lo)}` : `about ${lo}–${formatMm(hi)}`
  const trimEstimated = edges.every((t) => confidenceStep(t.evidence) === 'estimated')

  const safe = [p.safeMarginMm.edge.value, p.safeMarginMm.cut.value].filter(
    (v): v is number => v !== null
  )
  const safeText = safe.length > 0 ? formatMm(Math.max(...safe)) : null

  const printerParts = [
    cut ? `${p.cuts.map((c) => c.label).join(', ')} on` : '',
    p.borderless.value === true ? 'print margin off (borderless)' : ''
  ].filter(Boolean)
  const tiles: PrinterSetupTile[] = [
    {
      id: 'dslrbooth',
      title: 'dslrBooth',
      text:
        copies === 2
          ? `Use the ${design} template, with “Print 2 per page” on.`
          : 'Use the template exactly as exported.'
    },
    {
      id: 'printer',
      title: 'Printer settings',
      text:
        printerParts.length > 0
          ? `${printerParts.join(', ')}.`.replace(/^./, (c) => c.toUpperCase())
          : 'Use the printer’s standard settings.'
    },
    { id: 'paper', title: 'Paper', text: `Load ${p.media.name} media.` }
  ]

  const productionVerified = p.verifiedEnvironment !== null
  return {
    subtitle,
    readiness,
    meterText: METER_TEXT[readiness.step],
    trimText,
    trimEstimated,
    safeText,
    tiles,
    productionVerified,
    productionText: productionVerified
      ? `Verified on the production booth (${p.verifiedDate}).`
      : 'Not yet verified on the production booth PC.',
    copies,
    cut
  }
}
