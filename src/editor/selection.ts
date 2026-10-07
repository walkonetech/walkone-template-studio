/** Pure selection helpers (the store and the Layers Panel share them). */

export const toggleId = (ids: readonly string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]

/** Inclusive range between two ids within an ordered list of visible row ids; unknown ids fall back to just `to`. */
export function rangeIds(ordered: readonly string[], from: string | null, to: string): string[] {
  const a = from === null ? -1 : ordered.indexOf(from)
  const b = ordered.indexOf(to)
  if (b < 0) return []
  if (a < 0) return [to]
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return ordered.slice(lo, hi + 1)
}
