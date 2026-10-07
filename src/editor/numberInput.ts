/**
 * Parsing/formatting for numeric inspector fields. The field keeps a text draft while typing and only
 * these functions run on commit, so partial input ("-", "1.", "12") never reaches project state.
 */

export interface NumberRule {
  min?: number
  max?: number
  /** Must be > 0. */
  positive?: boolean
  integer?: boolean
}

export type ParsedNumber = { ok: true; value: number } | { ok: false; reason: string }

export const DECIMALS = 3

export function roundTo(n: number, decimals = DECIMALS): number {
  const f = 10 ** decimals
  const r = Math.round(n * f) / f
  return r === 0 ? 0 : r
}

/** Display text for a value: up to 3 decimals, no trailing zeros. */
export const formatNumber = (n: number): string => String(roundTo(n))

export function parseNumberInput(text: string, rule: NumberRule = {}): ParsedNumber {
  let t = text
    .trim()
    .replace(/\s*px$/i, '')
    .replace(/%$/, '')
    .trim()
  if (t === '') return { ok: false, reason: 'Enter a number' }
  if (!t.includes('.') && /^-?\d+,\d+$/.test(t)) t = t.replace(',', '.')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: false, reason: 'Not a valid number' }
  let value = Number(t)
  if (!Number.isFinite(value)) return { ok: false, reason: 'Not a valid number' }
  if (rule.integer) {
    if (!Number.isInteger(value)) return { ok: false, reason: 'Must be a whole number' }
  } else {
    value = roundTo(value)
  }
  if (rule.positive && !(value > 0)) return { ok: false, reason: 'Must be greater than 0' }
  if (rule.min !== undefined && value < rule.min)
    return { ok: false, reason: `Must be at least ${rule.min}` }
  if (rule.max !== undefined && value > rule.max)
    return { ok: false, reason: `Must be at most ${rule.max}` }
  return { ok: true, value }
}

/** Opacity is stored 0..1 and shown 0..100 %; the conversion lives only at the UI boundary. */
export const opacityToPercent = (o: number): number => roundTo(o * 100, 1)
export const percentToOpacity = (p: number): number => roundTo(p / 100, 4)

/** `#abc`, `abc`, `#aabbcc`, `AABBCCDD` ... -> canonical lowercase `#rrggbb[aa]`, or null. */
export function normalizeHex(text: string): string | null {
  let t = text.trim().toLowerCase().replace(/^#/, '')
  if (/^[0-9a-f]{3,4}$/.test(t)) t = [...t].map((c) => c + c).join('')
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/.test(t) ? `#${t}` : null
}
