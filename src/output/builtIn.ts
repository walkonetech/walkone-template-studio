import dnpDsRx1 from './profiles/dnp-ds-rx1-6x4-2inch-cut.json'
import { parseOutputProfile, type OutputProfile } from './profile'

/**
 * Profiles bundled with the app. Each is a JSON data file validated by the profile schema when the app loads it, so a
 * measurement update is an edit to the data file. A bundled profile that fails validation is a build defect: it
 * throws here (and the unit tests load every bundled profile).
 */
const BUNDLED: readonly unknown[] = [dnpDsRx1]

function load(data: unknown): OutputProfile {
  const r = parseOutputProfile(data)
  if (!r.ok) throw new Error(`Bundled output profile is invalid: ${r.error}`)
  return r.profile
}

export const BUILT_IN_PROFILES: readonly OutputProfile[] = BUNDLED.map(load)

export const DNP_DS_RX1_PROFILE_ID = 'dnp-ds-rx1-6x4-2inch-cut'

export function findOutputProfile(id: string | null | undefined): OutputProfile | null {
  if (!id) return null
  return BUILT_IN_PROFILES.find((p) => p.id === id) ?? null
}
