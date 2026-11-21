import { describe, expect, it } from 'vitest'
import { BUILT_IN_PROFILES, DNP_DS_RX1_PROFILE_ID } from '../builtIn'
import { confidenceStep, profileReadiness } from '../evidenceTier'
import type { Evidence, OutputProfile } from '../profile'
import { printerView } from '../printerView'

/** Printer & cutting (Phase 7B B4): a plain-language reading of a profile that never upgrades its evidence. */

const rx1 = BUILT_IN_PROFILES.find((p) => p.id === DNP_DS_RX1_PROFILE_ID)!

describe('printerView: DNP DS-RX1', () => {
  const v = printerView(rx1)

  it('reads "Tested on a print" and "Ready to use"', () => {
    expect(v.readiness).toEqual({ ready: true, label: 'Ready to use', step: 'tested' })
    expect(v.meterText).toMatch(/real print looked right/)
    expect(v.meterText).toMatch(/not measured exactly/)
  })

  it('keeps the trim an estimate and the 3 mm safe line as guidance', () => {
    expect(v.trimText).toBe('about 1.6–1.8 mm')
    expect(v.trimEstimated).toBe(true)
    expect(v.safeText).toBe('3 mm')
    // The underlying evidence is unchanged: trim inferred, safe line provisional, cut loss unknown.
    expect(rx1.trimMm.top.evidence).toBe('inferred')
    expect(rx1.safeMarginMm.edge.evidence).toBe('provisional')
    expect(rx1.trimMm.cut.evidence).toBe('unknown')
  })

  it('production booth stays unverified', () => {
    expect(v.productionVerified).toBe(false)
    expect(v.productionText).toBe('Not yet verified on the production booth PC.')
    expect(rx1.verifiedEnvironment).toBeNull()
  })

  it('says how to set up the booth PC in three picture tiles, in plain words', () => {
    expect(v.subtitle).toBe('6×4 (PC) paper · two 2×6 strips per sheet, cut apart by the printer')
    expect(v.tiles.map((t) => [t.id, t.title])).toEqual([
      ['dslrbooth', 'dslrBooth'],
      ['printer', 'Printer settings'],
      ['paper', 'Paper']
    ])
    expect(v.tiles[0]!.text).toBe('Use the 2×6 template, with “Print 2 per page” on.')
    expect(v.tiles[1]!.text).toBe('2-inch centre cut on, print margin off (borderless).')
    expect(v.tiles[2]!.text).toBe('Load 6×4 (PC) media.')
    // No driver-private keywords in the primary text.
    expect(v.tiles.map((t) => t.text).join(' ')).not.toMatch(/CUT_2INCH|_2x|PrintTicket/)
  })
})

describe('the friendly meter never collapses the evidence model', () => {
  const at = (confidence: Evidence, verified = false): OutputProfile => ({
    ...rx1,
    confidence,
    verifiedEnvironment: verified ? 'Booth PC' : null,
    verifiedDate: verified ? '2027-01-01' : null
  })

  it('maps the seven evidence levels onto Estimated · Tested on a print · Measured', () => {
    const steps = (
      [
        'unknown',
        'nominal',
        'inferred',
        'provisional',
        'observed-test-laptop',
        'owner-measured',
        'verified-production'
      ] as Evidence[]
    ).map(confidenceStep)
    expect(steps).toEqual([
      'estimated',
      'estimated',
      'estimated',
      'estimated',
      'tested',
      'measured',
      'measured'
    ])
    expect(profileReadiness('provisional')).toMatchObject({ ready: false, label: 'Estimated' })
  })

  it('"Measured" does not imply production-booth verification', () => {
    const v = printerView(at('owner-measured'))
    expect(v.readiness.step).toBe('measured')
    expect(v.productionVerified).toBe(false)
    expect(v.meterText).toMatch(/not the same as verified on the production booth/)
    const verified = printerView(at('verified-production', true))
    expect(verified.productionVerified).toBe(true)
    expect(verified.productionText).toMatch(/Verified on the production booth/)
  })

  it('an estimated profile is not "Ready to use"', () => {
    const v = printerView(at('inferred'))
    expect(v.readiness).toEqual({ ready: false, label: 'Estimated', step: 'estimated' })
  })
})
