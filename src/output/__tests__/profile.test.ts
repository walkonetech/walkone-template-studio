import { describe, expect, it } from 'vitest'
import raw from '../profiles/dnp-ds-rx1-6x4-2inch-cut.json'
import { BUILT_IN_PROFILES, DNP_DS_RX1_PROFILE_ID, findOutputProfile } from '../builtIn'
import {
  EVIDENCE_LABELS,
  EVIDENCE_LEVELS,
  isVerifiedEvidence,
  parseOutputProfile,
  profileDesignSize,
  profileStatusLabel,
  type OutputProfile
} from '../profile'

const clone = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(raw)) as Record<string, unknown>
const dsrx1 = (): OutputProfile => findOutputProfile(DNP_DS_RX1_PROFILE_ID) as OutputProfile

describe('output profile parsing and validation', () => {
  it('loads every bundled profile through the schema', () => {
    expect(BUILT_IN_PROFILES.length).toBeGreaterThanOrEqual(1)
    for (const p of BUILT_IN_PROFILES) expect(parseOutputProfile(p).ok).toBe(true)
    expect(new Set(BUILT_IN_PROFILES.map((p) => p.id)).size).toBe(BUILT_IN_PROFILES.length)
  })

  it('finds a profile by id; unknown or empty ids give none', () => {
    expect(findOutputProfile(DNP_DS_RX1_PROFILE_ID)?.shortName).toBe('DNP DS-RX1')
    expect(findOutputProfile('no-such-profile')).toBeNull()
    expect(findOutputProfile(null)).toBeNull()
    expect(findOutputProfile('')).toBeNull()
  })

  it('rejects unknown fields, wrong format/version and unknown evidence levels', () => {
    expect(parseOutputProfile({ ...clone(), printTicket: 'x' }).ok).toBe(false)
    expect(parseOutputProfile({ ...clone(), formatVersion: 2 }).ok).toBe(false)
    expect(parseOutputProfile({ ...clone(), format: 'other' }).ok).toBe(false)
    expect(parseOutputProfile({ ...clone(), confidence: 'certain' }).ok).toBe(false)
    expect(parseOutputProfile(null).ok).toBe(false)
  })

  it('requires null exactly for unknown values (a measurement cannot be "unknown" and have a value)', () => {
    const a = clone()
    ;(a.trimMm as Record<string, unknown>).cut = { value: 1, evidence: 'unknown' }
    const r = parseOutputProfile(a)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/trimMm\.cut/)
    const b = clone()
    ;(b.trimMm as Record<string, unknown>).top = { value: null, evidence: 'inferred' }
    expect(parseOutputProfile(b).ok).toBe(false)
  })

  it('rejects negative distances and cuts outside the sheet', () => {
    const a = clone()
    ;(a.safeMarginMm as Record<string, unknown>).edge = { value: -1, evidence: 'provisional' }
    expect(parseOutputProfile(a).ok).toBe(false)
    const b = clone()
    ;(b.cuts as Record<string, unknown>[])[0] = {
      ...((b.cuts as Record<string, unknown>[])[0] as object),
      positionIn: 4
    }
    const r = parseOutputProfile(b)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/outside/)
  })

  it('accepts a measurement update as pure data (owner readout replaces inferred trim)', () => {
    const a = clone()
    const trim = a.trimMm as Record<string, unknown>
    trim.top = { value: 1.5, evidence: 'owner-measured', note: 'Measured on the test print.' }
    trim.cut = { value: 0.4, evidence: 'owner-measured' }
    ;(a.finishing as Record<string, unknown>).cutOnSeam = {
      value: 'Cut on the seam',
      evidence: 'owner-measured'
    }
    a.confidence = 'owner-measured'
    const r = parseOutputProfile(a)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.profile.trimMm.top.value).toBe(1.5)
      expect(profileStatusLabel(r.profile)).toBe('DNP DS-RX1 · 2×6 · Owner-measured')
    }
  })

  it('verified environment and date go together', () => {
    expect(parseOutputProfile({ ...clone(), verifiedEnvironment: 'Booth PC' }).ok).toBe(false)
    expect(
      parseOutputProfile({
        ...clone(),
        verifiedEnvironment: 'Booth PC',
        verifiedDate: '2026-12-01'
      }).ok
    ).toBe(true)
  })
})

describe('DNP DS-RX1 profile: only observed Phase 6C values, estimates marked as such', () => {
  it('describes the observed device, driver, media, driver page and borderless output', () => {
    const p = dsrx1()
    expect(p.name).toBe('DNP DS-RX1 · 6×4 PC · 2-inch cut · borderless')
    expect(p.device).toMatchObject({ manufacturer: 'DNP', model: 'DS-RX1' })
    expect(p.device?.driverVersion).toMatchObject({
      value: '1.1.1.0',
      evidence: 'observed-test-laptop'
    })
    expect(p.media.nominalMm).toEqual({ width: 152.4, height: 101.6 })
    expect(p.media.driverPageMm).toMatchObject({
      value: { width: 156.1, height: 105 },
      evidence: 'observed-test-laptop'
    })
    expect(p.borderless).toMatchObject({ value: true, evidence: 'observed-test-laptop' })
    expect(p.sheet).toEqual({ widthIn: 4, heightIn: 6 })
    expect(p.composition).toEqual({ mode: 'copies', columns: 2, rows: 1 })
    expect(p.cuts).toHaveLength(1)
    expect(p.cuts[0]).toMatchObject({ axis: 'x', positionIn: 2, evidence: 'observed-test-laptop' })
  })

  it('never presents trim or the safe margin as verified; the test print is recorded as observed', () => {
    const p = dsrx1()
    expect(p.confidence).toBe('observed-test-laptop')
    expect(isVerifiedEvidence(p.confidence)).toBe(false)
    for (const edge of ['top', 'bottom', 'left', 'right'] as const) {
      expect(p.trimMm[edge].evidence).toBe('inferred')
      expect(isVerifiedEvidence(p.trimMm[edge].evidence)).toBe(false)
    }
    expect([p.trimMm.top.value, p.trimMm.left.value]).toEqual([1.8, 1.6])
    expect(p.trimMm.cut).toMatchObject({ value: null, evidence: 'unknown' })
    expect(p.safeMarginMm.edge).toMatchObject({ value: 3, evidence: 'provisional' })
    expect(p.safeMarginMm.cut).toMatchObject({ value: 3, evidence: 'provisional' })
    for (const k of ['autoCut', 'cutOnSeam', 'gutter'] as const) {
      expect(p.finishing[k].evidence).toBe('observed-test-laptop')
      expect(p.finishing[k].value).not.toBeNull()
    }
    expect(p.verifiedEnvironment).toBeNull()
    expect(p.verifiedDate).toBeNull()
    expect(p.observedEnvironment).toMatch(/research laptop.*not the production booth PC/)
  })

  it('carries no machine names, paths or addresses', () => {
    // (the driver version 1.1.1.0 is the one dotted number allowed)
    const text = JSON.stringify(raw).replace('"1.1.1.0"', '')
    expect(text).not.toMatch(
      /[A-Z]:\\\\|\/Users\/|DESKTOP-|LAPTOP-|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/
    )
  })
})

describe('profile evidence and status display', () => {
  it('labels every evidence level; only owner-measured and production-verified count as verified', () => {
    for (const e of EVIDENCE_LEVELS) expect(EVIDENCE_LABELS[e].length).toBeGreaterThan(0)
    expect(EVIDENCE_LEVELS.filter(isVerifiedEvidence)).toEqual([
      'owner-measured',
      'verified-production'
    ])
    expect(EVIDENCE_LABELS['observed-test-laptop']).toBe('Observed on test laptop')
  })

  it('shows a compact status: "DNP DS-RX1 · 2×6 · Observed on test laptop"', () => {
    expect(profileStatusLabel(dsrx1())).toBe('DNP DS-RX1 · 2×6 · Observed on test laptop')
    expect(profileDesignSize(dsrx1())).toBe('2×6')
  })
})
