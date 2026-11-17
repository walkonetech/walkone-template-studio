import type { DslrElementIn } from './template'

/**
 * Two 2×6 strips side by side on one 4×6 sheet (the structure of the owner's hand-built dslrBooth templates,
 * research/DSLRBOOTH_FIXTURE_ANALYSIS.md §10): every element of the right half repeats one in the left half, offset by
 * half the canvas width, with the same photo number or picture. Copies are placed by hand, so positions match only
 * approximately (a few pixels); the tolerance is 2% of the strip width (24 px on a 1200 px strip).
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
  e.kind === 'photo' ? `photo slot ${e.photoNumber}` : `“${e.name || e.imagePath}”`

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
  const left: DslrElementIn[] = []
  const right: DslrElementIn[] = []
  for (const e of elements) (e.x + e.width / 2 < cellWidth ? left : right).push(e)
  if (left.length === 0 || left.length !== right.length) return null
  if (!left.some((e) => e.kind === 'photo')) return null

  const sameThing = (a: DslrElementIn, b: DslrElementIn): boolean =>
    a.kind === b.kind &&
    (a.kind === 'photo' ? a.photoNumber === b.photoNumber : a.imagePath === b.imagePath)
  const closeness = (l: DslrElementIn, r: DslrElementIn): number =>
    Math.max(
      Math.abs(r.x - cellWidth - l.x),
      Math.abs(r.y - l.y),
      Math.abs(r.width - l.width),
      Math.abs(r.height - l.height)
    )

  const unpaired = new Set(left)
  const pairs: [DslrElementIn, DslrElementIn][] = []
  for (const r of right) {
    let best: DslrElementIn | null = null
    let bestD = Infinity
    for (const l of unpaired) {
      if (!sameThing(l, r)) continue
      const d = closeness(l, r)
      if (d < bestD) {
        best = l
        bestD = d
      }
    }
    if (!best || bestD > tol) return null
    unpaired.delete(best)
    pairs.push([best, r])
  }

  const differences: string[] = []
  for (const [l, r] of pairs) {
    const what: string[] = []
    if (normAngle(l.rotation) !== normAngle(r.rotation))
      what.push(`rotated ${Math.round(r.rotation)}° instead of ${Math.round(l.rotation)}°`)
    if (Math.abs(l.opacity - r.opacity) > 0.005) what.push('different transparency')
    if (l.visible !== r.visible) what.push(r.visible ? 'visible' : 'hidden')
    if (what.length > 0) differences.push(`In the right strip, ${label(r)} is ${what.join(', ')}.`)
  }
  // Stacking: what covers what is decided by the order of pictures relative to photo slots. Compare that sequence.
  const order = (list: DslrElementIn[]): DslrElementIn[] =>
    [...list].sort((a, b) => a.zIndex - b.zIndex || b.index - a.index)
  const kinds = (list: DslrElementIn[]): string =>
    list.map((e) => (e.kind === 'photo' ? 'P' : 'I')).join('')
  if (kinds(order(left)) !== kinds(order(right)))
    differences.push('The two strips stack their pictures and photo slots in a different order.')

  const crossing = left.filter((e) => e.x + e.width > cellWidth + tol).length
  const maxOffset = Math.max(0, ...pairs.map(([l, r]) => closeness(l, r)))

  return { cellWidth, left, right, differences, crossing, maxOffset }
}
