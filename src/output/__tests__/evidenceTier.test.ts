import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_PROFILES,
  CONFIDENCE_STEP_LABELS,
  DNP_DS_RX1_PROFILE_ID,
  EVIDENCE_LABELS,
  EVIDENCE_LEVELS,
  EVIDENCE_TIERS,
  EVIDENCE_TIER_LABELS,
  confidenceStep,
  evidenceBadgeModel,
  evidenceTier,
  isVerifiedEvidence,
  profileReadiness
} from '..'

describe('evidence tiers (Phase 7A §23)', () => {
  it('groups every evidence level into one of five tiers', () => {
    expect(EVIDENCE_TIERS).toEqual(['verified', 'observed', 'estimated', 'reference', 'unknown'])
    expect(EVIDENCE_LEVELS.map(evidenceTier)).toEqual([
      'unknown',
      'reference',
      'estimated',
      'estimated',
      'observed',
      'verified',
      'verified'
    ])
    expect(Object.values(EVIDENCE_TIER_LABELS)).toEqual([
      'Verified',
      'Observed',
      'Estimated',
      'Reference',
      'Unknown'
    ])
  })

  it('the Verified tier is exactly isVerifiedEvidence (no level is upgraded by grouping)', () => {
    for (const e of EVIDENCE_LEVELS)
      expect(evidenceTier(e) === 'verified').toBe(isVerifiedEvidence(e))
  })

  it('a badge keeps the precise level word; the tier only drives icon and tone', () => {
    const m = evidenceBadgeModel('observed-test-laptop')
    expect(m).toMatchObject({ tier: 'observed', tierLabel: 'Observed' })
    expect(m.label).toBe(EVIDENCE_LABELS['observed-test-laptop'])
    expect(m.hint.length).toBeGreaterThan(0)
  })
})

describe('friendly confidence never replaces the evidence model', () => {
  it('maps to Estimated → Tested on a print → Measured', () => {
    expect(confidenceStep('inferred')).toBe('estimated')
    expect(confidenceStep('provisional')).toBe('estimated')
    expect(confidenceStep('nominal')).toBe('estimated')
    expect(confidenceStep('unknown')).toBe('estimated')
    expect(confidenceStep('observed-test-laptop')).toBe('tested')
    expect(confidenceStep('owner-measured')).toBe('measured')
    expect(confidenceStep('verified-production')).toBe('measured')
    expect(Object.values(CONFIDENCE_STEP_LABELS)).toEqual([
      'Estimated',
      'Tested on a print',
      'Measured'
    ])
  })

  it('"Measured" (owner-measured) is still not "Verified on production booth"', () => {
    expect(confidenceStep('owner-measured')).toBe('measured')
    expect(EVIDENCE_LABELS['owner-measured']).not.toMatch(/production/i)
    expect(EVIDENCE_LABELS['verified-production']).toMatch(/production booth/i)
  })

  it('DS-RX1 reads "Ready to use · Tested on a print" while its evidence stays observed, trim estimated and production unset', () => {
    const p = BUILT_IN_PROFILES.find((x) => x.id === DNP_DS_RX1_PROFILE_ID)!
    expect(p.confidence).toBe('observed-test-laptop')
    expect(profileReadiness(p.confidence)).toEqual({
      ready: true,
      label: 'Ready to use',
      step: 'tested'
    })
    expect(isVerifiedEvidence(p.confidence)).toBe(false)
    expect(evidenceTier(p.confidence)).toBe('observed')
    expect(profileReadiness('provisional')).toMatchObject({ ready: false, label: 'Estimated' })
  })
})
