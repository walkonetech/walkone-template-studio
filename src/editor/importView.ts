/**
 * The plain-language reading of a dslrBooth import analysis (Phase 7B B4, B1 mockup 10). Presentation only: the
 * importer's detection, layouts, recommendation and notes are unchanged; this decides what is said first and what
 * stays behind "Compatibility details".
 *
 *  - The found summary names the format in words ("We found a 2×6 design printed twice on a 4×6 sheet.").
 *  - "For you": what the chosen layout means, everything that needs attention (warnings: missing pieces, text that
 *    overflows, equal stacking numbers that overlap, unsupported effects) and a few Good to know notes a designer acts
 *    on (text stays editable, pictures came in flattened, print 2 per page, locked/hidden layers). The two-up notes
 *    are said by the layout meaning, so they sit with the technical notes.
 *  - Compatibility details: the remaining technical notes and the raw facts. Nothing is dropped: every note is shown
 *    in one of the two places.
 */

export interface ImportFacts {
  widthIn: number
  heightIn: number
  photoSlots: number
  photoCount: number
  images: number
  twoUp: { stripWidthIn: number; stripHeightIn: number } | null
}

export interface ImportNote {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

/** Good to know notes that belong in "For you" (the rest are technical compatibility notes). */
export const FOR_YOU_NOTES: readonly string[] = [
  'print-2-per-page',
  'live-text',
  'flattened-artwork',
  'locked',
  'hidden'
]

const n2 = (n: number): string => String(Math.round(n * 100) / 100)
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

export function importFoundSummary(f: ImportFacts): { headline: string; detail: string } {
  const sheet = `${n2(f.widthIn)}×${n2(f.heightIn)}`
  const headline = f.twoUp
    ? `We found a ${n2(f.twoUp.stripWidthIn)}×${n2(f.twoUp.stripHeightIn)} design printed twice on a ${sheet} sheet.`
    : `We found a ${sheet} design.`
  const slots = f.twoUp ? Math.round(f.photoSlots / 2) : f.photoSlots
  const detail = [
    f.twoUp ? `${plural(slots, 'photo slot')} per strip` : plural(slots, 'photo slot'),
    f.photoCount !== slots ? `${plural(f.photoCount, 'photo')} per session` : '',
    f.twoUp ? `${plural(f.images, 'picture')} on the sheet` : plural(f.images, 'picture')
  ]
    .filter(Boolean)
    .join(' · ')
  return { headline, detail }
}

export function splitImportNotes(notes: readonly ImportNote[]): {
  forYou: ImportNote[]
  technical: ImportNote[]
} {
  const forYou = notes.filter((n) => n.severity !== 'info' || FOR_YOU_NOTES.includes(n.code))
  const technical = notes.filter((n) => !forYou.includes(n))
  return { forYou, technical }
}

/** The two layout choices for a recognised two-strip sheet, in display order (Recommended first). */
export function importLayoutChoices(
  f: ImportFacts & { recommendedLayout: 'strip' | 'as-is' }
): { value: 'strip' | 'as-is'; title: string; hint: string; recommended: boolean }[] {
  if (!f.twoUp) return []
  const strip = `${n2(f.twoUp.stripWidthIn)}×${n2(f.twoUp.stripHeightIn)}`
  const sheet = `${n2(f.widthIn)}×${n2(f.heightIn)}`
  const choices = [
    {
      value: 'strip' as const,
      title: `One ${strip} strip, printed two per sheet`,
      hint: 'Edit one strip; the second copy follows it.',
      recommended: f.recommendedLayout === 'strip'
    },
    {
      value: 'as-is' as const,
      title: `The ${sheet} sheet exactly as it is`,
      hint: 'Both strips become separate layers you edit one by one.',
      recommended: f.recommendedLayout === 'as-is'
    }
  ]
  return choices.sort((a, b) => Number(b.recommended) - Number(a.recommended))
}

/** What the chosen layout means, for "For you". */
export const layoutMeaning = (layout: 'strip' | 'as-is'): string =>
  layout === 'strip'
    ? 'You edit one strip. Template Studio and dslrBooth print the second copy for you, so both always match.'
    : 'Both strips stay separate layers. A change to one is not copied to the other.'
