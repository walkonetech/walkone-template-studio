import { EVIDENCE_HINTS, EVIDENCE_LABELS, type Evidence } from './profile'

/**
 * Presentation tiers for evidence (Phase 7A §23, B1 sign-off). Five tiers group the seven evidence levels for icons
 * and tone; the precise level label (`EVIDENCE_LABELS`) is still what a badge says, so grouping never hides what a
 * value actually rests on. Shared with WalkOne Booth later. Colour is never the only signal: each tier has an icon
 * and a word.
 */
export const EVIDENCE_TIERS = ['verified', 'observed', 'estimated', 'reference', 'unknown'] as const
export type EvidenceTier = (typeof EVIDENCE_TIERS)[number]

export const EVIDENCE_TIER_OF: Readonly<Record<Evidence, EvidenceTier>> = {
  'verified-production': 'verified',
  'owner-measured': 'verified',
  'observed-test-laptop': 'observed',
  inferred: 'estimated',
  provisional: 'estimated',
  nominal: 'reference',
  unknown: 'unknown'
}

export const evidenceTier = (e: Evidence): EvidenceTier => EVIDENCE_TIER_OF[e]

export const EVIDENCE_TIER_LABELS: Readonly<Record<EvidenceTier, string>> = {
  verified: 'Verified',
  observed: 'Observed',
  estimated: 'Estimated',
  reference: 'Reference',
  unknown: 'Unknown'
}

/** Icon names (lucide) per tier; the renderer maps them to components. */
export const EVIDENCE_TIER_ICONS: Readonly<Record<EvidenceTier, string>> = {
  verified: 'circle-check',
  observed: 'eye',
  estimated: 'equal-approximately',
  reference: 'ruler',
  unknown: 'circle-help'
}

/** Everything a badge needs for one evidence level. */
export function evidenceBadgeModel(e: Evidence): {
  tier: EvidenceTier
  tierLabel: string
  label: string
  hint: string
} {
  const tier = evidenceTier(e)
  return {
    tier,
    tierLabel: EVIDENCE_TIER_LABELS[tier],
    label: EVIDENCE_LABELS[e],
    hint: EVIDENCE_HINTS[e]
  }
}

/**
 * The friendly 3-step "How sure are we?" meter (B1: Estimated → Tested on a print → Measured). It is a summary for
 * people, NOT a replacement for the evidence model: "Measured" (owner-measured) does not mean "Verified on the
 * production booth", and the detailed per-value evidence stays authoritative.
 */
export const CONFIDENCE_STEPS = ['estimated', 'tested', 'measured'] as const
export type ConfidenceStep = (typeof CONFIDENCE_STEPS)[number]
export const CONFIDENCE_STEP_LABELS: Readonly<Record<ConfidenceStep, string>> = {
  estimated: 'Estimated',
  tested: 'Tested on a print',
  measured: 'Measured'
}

export function confidenceStep(e: Evidence): ConfidenceStep {
  if (e === 'owner-measured' || e === 'verified-production') return 'measured'
  if (e === 'observed-test-laptop') return 'tested'
  return 'estimated'
}

/**
 * The product-level status of a profile: "Ready to use" once a real print has been seen to work (observed or better),
 * otherwise "Estimated". It never claims production-booth verification; that stays a separate, explicit level.
 */
export function profileReadiness(confidence: Evidence): {
  ready: boolean
  label: string
  step: ConfidenceStep
} {
  const step = confidenceStep(confidence)
  const ready = step !== 'estimated'
  return { ready, label: ready ? 'Ready to use' : 'Estimated', step }
}
