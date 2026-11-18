import type { DslrElementIn } from './template'

/**
 * Two 2×6 strips side by side on one 4×6 sheet (the structure of the owner's hand-built dslrBooth templates,
 * research/DSLRBOOTH_FIXTURE_ANALYSIS.md §10): every element of the right half repeats one in the left half, offset by
 * about half the canvas width, with the same photo number, picture or text.
 *
 * Copies are placed by hand, so positions match only approximately. The photo slots are the structural evidence and
 * are held to a tight tolerance (2 % of the strip width, 24 px on a 1200 px strip). Text and pictures are matched by
 * their content and may sit further off (5 % of the strip width, 60 px), measured either from an exact half-sheet copy
 * or from how the photo slots themselves were copied (6C C1 re-test: owner template D's photos were copied 1187 px
 * across and its two text lines 1165 px; with text held to the photo tolerance the sheet stopped being recognised).
 * Every element must still find its copy, so two genuinely different strips are never treated as one.
 */

export interface TwoUpDetection {
  /** Width of one strip (half the canvas). */
  cellWidth: number
  /** Elements of the left strip (kept when importing as a strip). */
  left: DslrElementIn[]
  /** Their copies in the right strip (dropped when importing as a strip). */
  right: DslrElementIn[]
  /** Human-readable differences between the two strips (empty when they are identical within tolerance). */
  differences: string[]
  /** Kept elements that reach past the strip edge (on the original sheet that part overlaps the other strip). */
  crossing: number
  /** Largest position/size difference between an element and its copy, in pixels (hand placement). */
  maxOffset: number
}

const normAngle = (deg: number): number => {
  const r = (((Math.round(deg * 100) / 100) % 360) + 360) % 360
  return r === 360 ? 0 : r
}

const label = (e: DslrElementIn): string =>
  e.kind === 'photo'
    ? `photo slot ${e.photoNumber}`
    : e.kind === 'text'
      ? `text “${e.text?.content ?? e.name}”`
      : `“${e.name || e.imagePath}”`

export function detectTwoUp(
  elements: readonly DslrElementIn[],
  canvasWidth: number,
  canvasHeight: number
): TwoUpDetection | null {
  if (canvasWidth % 2 !== 0) return null
  const cellWidth = canvasWidth / 2
  // Only a portrait strip makes sense as "two strips side by side".
  if (canvasHeight <= cellWidth) return null
  const tol = Math.max(8, cellWidth * 0.02)
  const looseTol = Math.max(tol, cellWidth * 0.05)
  const left: DslrElementIn[] = []
  const right: DslrElementIn[] = []
  for (const e of elements) (e.x + e.width / 2 < cellWidth ? left : right).push(e)
  if (left.length === 0 || left.length !== right.length) return null
  if (!left.some((e) => e.kind === 'photo')) return null

  const sameThing = (a: DslrElementIn, b: DslrElementIn): boolean =>
    a.kind === b.kind &&
    (a.kind === 'photo'
      ? a.photoNumber === b.photoNumber
      : a.kind === 'text'
        ? a.text?.content === b.text?.content
        : a.imagePath === b.imagePath)
  /** Largest position/size difference between `l` and `r` when `r` should be `l` moved by (dx, dy). */
  const closeness = (l: DslrElementIn, r: DslrElementIn, dx = cellWidth, dy = 0): number =>
    Math.max(
      Math.abs(r.x - dx - l.x),
      Math.abs(r.y - dy - l.y),
      Math.abs(r.width - l.width),
      Math.abs(r.height - l.height)
    )

  const unpaired = new Set(left)
  const pairs: [DslrElementIn, DslrElementIn][] = []
  const pairAll = (
    rights: DslrElementIn[],
    distance: (l: DslrElementIn, r: DslrElementIn) => number,
    limit: number
  ): boolean => {
    for (const r of rights) {
      let best: DslrElementIn | null = null
      let bestD = Infinity
      for (const l of unpaired) {
        if (!sameThing(l, r)) continue
        const d = distance(l, r)
        if (d < bestD) {
          best = l
          bestD = d
        }
      }
      if (!best || bestD > limit) return false
      unpaired.delete(best)
      pairs.push([best, r])
    }
    return true
  }
  // 1. Photo slots: the structure. Each must be a close copy of a left slot with the same photo number.
  if (
    !pairAll(
      right.filter((e) => e.kind === 'photo'),
      (l, r) => closeness(l, r),
      tol
    )
  )
    return null
  // 2. Text and pictures, matched by content, against an exact copy or the photo slots' own copy offset.
  const median = (v: number[]): number => {
    const s = [...v].sort((a, b) => a - b)
    const m = s.length >> 1
    return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
  }
  const photoDx = median(pairs.map(([l, r]) => r.x - l.x))
  const photoDy = median(pairs.map(([l, r]) => r.y - l.y))
  const decoration = (l: DslrElementIn, r: DslrElementIn): number =>
    Math.min(closeness(l, r), closeness(l, r, photoDx, photoDy))
  if (
    !pairAll(
      right.filter((e) => e.kind !== 'photo'),
      decoration,
      looseTol
    )
  )
    return null

  const differences: string[] = []
  for (const [l, r] of pairs) {
    const what: string[] = []
    if (normAngle(l.rotation) !== normAngle(r.rotation))
      what.push(`rotated ${Math.round(r.rotation)}° instead of ${Math.round(l.rotation)}°`)
    if (Math.abs(l.opacity - r.opacity) > 0.005) what.push('different transparency')
    if (l.visible !== r.visible) what.push(r.visible ? 'visible' : 'hidden')
    if (l.text && r.text) {
      if (l.text.fontName !== r.text.fontName || l.text.fontWeight !== r.text.fontWeight)
        what.push('in a different font')
      // Object.is: an absent size or alignment (NaN, e.g. owner template D) equals an absent one in the copy.
      if (!Object.is(l.text.fontSize, r.text.fontSize)) what.push('a different size')
      if (l.text.color !== r.text.color) what.push('a different colour')
      if (!Object.is(l.text.alignment, r.text.alignment)) what.push('aligned differently')
    }
    if (what.length > 0) differences.push(`In the right strip, ${label(r)} is ${what.join(', ')}.`)
  }
  // Stacking: what covers what is decided by the order of pictures relative to photo slots. Compare that sequence.
  const order = (list: DslrElementIn[]): DslrElementIn[] =>
    [...list].sort((a, b) => a.zIndex - b.zIndex || b.index - a.index)
  const kinds = (list: DslrElementIn[]): string =>
    list.map((e) => (e.kind === 'photo' ? 'P' : e.kind === 'text' ? 'T' : 'I')).join('')
  if (kinds(order(left)) !== kinds(order(right)))
    differences.push(
      'The two strips stack their pictures, text and photo slots in a different order.'
    )

  const crossing = left.filter((e) => e.x + e.width > cellWidth + tol).length
  const maxOffset = Math.max(0, ...pairs.map(([l, r]) => closeness(l, r)))

  return { cellWidth, left, right, differences, crossing, maxOffset }
}
