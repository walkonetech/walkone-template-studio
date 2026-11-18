/**
 * Text measurement helpers for importing dslrBooth live `<Text>` (6C finding C1). Pure and deterministic: the importer
 * runs without a canvas or the fonts, so widths are ESTIMATED from the standard Helvetica advance widths (Arial is
 * metric-compatible with Helvetica). They only decide two things: whether a box dslrBooth sized to fit its text needs
 * a few extra pixels so Template Studio does not wrap it, and the fixed size that approximates dslrBooth's "Auto" size.
 */

// Standard Helvetica / Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126.
// prettier-ignore
const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
]
// prettier-ignore
const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
]
/** Characters outside ASCII get an average-letter width. */
const OTHER = 556

/** Width of one line of `text` in em (the longest line when it has line breaks). */
export function estimateWidthEm(text: string, bold: boolean): number {
  const table = bold ? BOLD : REGULAR
  let widest = 0
  for (const line of text.split('\n')) {
    let w = 0
    for (const ch of line) {
      const c = ch.codePointAt(0) ?? 0
      w += c >= 32 && c <= 126 ? (table[c - 32] as number) : c < 32 ? 0 : OTHER
    }
    widest = Math.max(widest, w)
  }
  return widest / 1000
}

/** Families whose widths the table matches closely; any other font's estimate is only a rough guide. */
const METRIC_FAMILIES = new Set([
  'arial',
  'helvetica',
  'helvetica neue',
  'arimo',
  'liberation sans'
])
export const hasKnownMetrics = (family: string): boolean =>
  METRIC_FAMILIES.has(
    family
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .trim()
      .toLowerCase()
  )

/** Width margin so a line that fit in dslrBooth does not wrap here (measurement differs between renderers/fonts). */
export const fitMargin = (family: string): number => (hasKnownMetrics(family) ? 1.04 : 1.15)

/**
 * Above this ratio of estimated text width to box width, the text did not fit in dslrBooth either: dslrBooth clips
 * it at the box edge (observed, fixture T13), so the box is NOT widened.
 */
export const overflowRatio = (family: string): number => (hasKnownMetrics(family) ? 1.1 : 1.35)

/**
 * dslrBooth "Auto" size (`FontSize="0"`) stretches the text to fill the whole box, unevenly. Observed in the fixture
 * (Arial "AUTO" in 150 px high boxes): capitals 97 px tall, i.e. an em of about 0.9 × the box height. Template Studio
 * cannot stretch letters, so it uses the largest uniform size that fits: that em height, or less if the width is short.
 */
export const AUTO_EM_PER_BOX_HEIGHT = 0.9

export interface DslrWeight {
  /** CSS weight 100–900. */
  weight: number
  italic: boolean
  /** Words of the style name Template Studio cannot represent (e.g. "Condensed"). */
  unsupported: string[]
  /** Words it did not recognise at all. */
  unknown: string[]
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/^(thin|hairline)$/, 100],
  [/^(extralight|ultralight)$/, 200],
  [/^light$/, 300],
  [/^(regular|normal|book|roman|plain)$/, 400],
  [/^medium$/, 500],
  [/^(semibold|demibold)$/, 600],
  [/^bold$/, 700],
  [/^(extrabold|ultrabold)$/, 800],
  [/^(black|heavy)$/, 900],
  [/^(extrablack|ultrablack)$/, 950]
]
const STRETCH = /^(ultra|extra|semi)?(condensed|narrow|compressed|expanded|extended|wide)$/

/**
 * dslrBooth's `FontWeight` is the font's own style name from its Weight list (observed: "Regular", "Bold", "Italic",
 * "Bold Italic"; the list also offers "Oblique", "Black", "Condensed" variants). Multi-word prefixes such as
 * "Semi Bold" / "Extra Light" are joined before matching.
 */
export function parseDslrWeight(raw: string): DslrWeight {
  const words = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
  const joined: string[] = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i] as string
    const next = words[i + 1]
    if (/^(semi|demi|extra|ultra)$/.test(w) && next !== undefined) {
      joined.push(w + next)
      i++
    } else joined.push(w)
  }
  let weight = 400
  let italic = false
  const unsupported: string[] = []
  const unknown: string[] = []
  for (const w of joined) {
    const hit = WEIGHT_WORDS.find(([re]) => re.test(w))
    if (hit) weight = hit[1]
    else if (w === 'italic' || w === 'oblique') italic = true
    else if (STRETCH.test(w)) unsupported.push(w)
    else unknown.push(w)
  }
  return { weight: Math.min(900, weight), italic, unsupported, unknown }
}
