/**
 * The dslrBooth target profile (Phase 6B). Everything vendor-specific about the 7.48 package lives under
 * `src/export/dslrbooth/`; the vendor-neutral `TemplateProject` never imports it (ADR-002, ADR-003).
 *
 * Evidence labels: fixture facts are CONFIRMED FROM FILE (research/DSLRBOOTH_FIXTURE_ANALYSIS.md); runtime behaviour is
 * owner-reported external research (research/DSLRBOOTH_748_RUNTIME_FINDINGS.md); everything else NEEDS VALIDATION on
 * the real Windows install in Phase 6C.
 */

export const DSLR_PROFILE = '7.48'
/** PhotoNumber range dslrBooth accepts (runtime findings). */
export const MAX_PHOTO_NUMBER = 12
/** Resolutions seen in real exports; anything else is a warning, not an error. */
export const KNOWN_RESOLUTIONS = [300, 600] as const
/** Written as `OriginalDevice` instead of a machine name (privacy; the fixtures carry the designer's PC name). */
export const ORIGINAL_DEVICE = 'WalkOneTemplateStudio'
/** Maximum entries in a dslrBooth package this app writes (images + preview + template.xml). */
export const MAX_DSLR_ENTRIES = 40

export const TEMPLATE_XML = 'template.xml'
export const PREVIEW_PNG = 'preview.png'

/** `#rrggbb` or `#rrggbbaa` (domain hex) → dslrBooth `#AARRGGBB` (upper case, as in the fixtures). */
export function toArgb(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(hex)
  if (!m) throw new RangeError(`Not a hex colour: ${hex}`)
  return `#${(m[2] ?? 'ff').toUpperCase()}${(m[1] as string).toUpperCase()}`
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** `LastSavedDate` as in the fixtures: US `MM/DD/YYYY HH:mm:ss`, local time, no time zone. */
export const formatSavedDate = (d: Date): string =>
  `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A 25-character alphanumeric template `Id` (the observed shape; dslrBooth's own rules are unknown). Deterministic for
 * a seed (project id + variant), so exporting the same project again gives the same Id. NEEDS VALIDATION in 6C whether
 * dslrBooth treats an equal Id as "the same template" on import.
 */
export function templateId(seed: string): string {
  // Four independent 32-bit FNV-1a streams → 25 base-62 characters. Not cryptographic; only stable and well spread.
  const streams = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((basis, k) => {
    let h = basis >>> 0
    for (const ch of `${k}:${seed}`) {
      h ^= ch.codePointAt(0) ?? 0
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h
  })
  let out = ''
  for (let i = 0; i < 25; i++) {
    const s = i % 4
    let h = streams[s] as number
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    h >>>= 0
    streams[s] = h
    out += ALPHABET[h % ALPHABET.length]
  }
  return out
}
