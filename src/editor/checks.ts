import type { PreflightSeverity } from './exportPreflight'
import {
  STATUS_LABELS,
  SEVERITY_TONE,
  checksHeadline,
  severityStartsCollapsed,
  type StatusTone
} from './severity'

/**
 * The Checks view model (Phase 7B B4, B1 mockup 07). ONE model serves the Checks panel, the Export dialog's checks
 * and the Printer & cutting summary, so the same finding never reads differently in two places.
 *
 *  - Three severity groups in plain words: Error · Needs attention · Good to know (internal levels stay
 *    error / warning / info). Good to know starts collapsed and never counts as a problem.
 *  - Repeats are merged: every finding with the same code becomes one card ("3 items are close to the edge") with
 *    Select all, and the individual messages stay behind Details. Internal check codes are never shown.
 *  - Only working actions are offered: Select (one layer), Select all (several) and Printer & cutting… (the
 *    printer-related findings). No disabled future "Fix" / "Move inside" / "Later" buttons (B1 sign-off amendment).
 * Pure: no DOM, no store. Computing it never changes the project.
 */

export interface CheckInput {
  code: string
  severity: PreflightSeverity
  message: string
  layerIds?: readonly string[]
}

export type CheckAction = 'select' | 'select-all' | 'printer'

export interface CheckCard {
  /** Stable key: the code (cards are merged per code). */
  id: string
  code: string
  severity: PreflightSeverity
  tone: StatusTone
  /** Short topic label ("Text", "Safe area", "dslrBooth"). */
  topic: string
  /** Plain-language headline. */
  title: string
  /** One short explanation (the finding itself for one item; a summary for merged items). */
  explanation: string
  /** Every layer the card is about (de-duplicated, in finding order). */
  layerIds: string[]
  /** The individual findings, for Details (one per merged item). */
  details: string[]
  /** How many findings were merged into this card. */
  count: number
  actions: CheckAction[]
}

export interface CheckGroup {
  severity: PreflightSeverity
  tone: StatusTone
  label: string
  cards: CheckCard[]
  startsCollapsed: boolean
}

export interface ChecksModel {
  groups: CheckGroup[]
  /** Counts of CARDS (a merged card is one thing to look at). */
  errors: number
  warnings: number
  infos: number
  headline: { tone: StatusTone; text: string }
}

const ORDER: readonly PreflightSeverity[] = ['error', 'warning', 'info']

const TOPICS: readonly [RegExp, string][] = [
  [/^dslr-/, 'dslrBooth'],
  [/^safe-area-/, 'Safe area'],
  [/^output-profile-/, 'Printer'],
  [/^font-/, 'Font'],
  [/^(asset-|image-)/, 'Images'],
  [/^(photo-|no-photo-slots)/, 'Photo slots'],
  [/^palette-/, 'Colors'],
  [/^(artwork-|hidden-layers|composition-)/, 'Layout']
]

export const checkTopic = (code: string): string =>
  TOPICS.find(([re]) => re.test(code))?.[1] ?? 'Design'

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const verb = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/** "Text “Date”" from a safe-area finding ("Text “Date” is 2.5 mm from …"). */
function subjectOf(message: string): string | null {
  const m = /^(.*?) (?:is|enters|crosses) /.exec(message)
  return m?.[1] ?? null
}

/** The plain-language title for a card of `n` merged findings about `layers` layers. */
function titleFor(code: string, items: readonly CheckInput[], layers: number): string {
  const n = items.length
  const one = n === 1 ? (subjectOf(items[0]!.message) ?? null) : null
  const L = Math.max(layers, 1)
  switch (code) {
    case 'composition-invalid':
      return 'The print layout is not valid'
    case 'asset-missing':
      return L === 1 ? 'An image file is missing' : `${L} image files are missing`
    case 'asset-unreadable':
      return L === 1 ? 'An image can’t be loaded' : `${L} images can’t be loaded`
    case 'palette-broken':
      return 'A colour points to a deleted palette colour'
    case 'photo-number-invalid':
      return `${plural(L, 'photo slot')} ${verb(L, 'has', 'have')} an invalid photo number`
    case 'photo-number-gap':
      return 'Photo numbers skip a number'
    case 'no-photo-slots':
      return 'The design has no photo slots'
    case 'photo-slot-outside':
      return `${plural(L, 'photo slot')} ${verb(L, 'reaches', 'reach')} past the edge`
    case 'font-missing':
      return `${plural(L, 'text')} ${verb(L, 'uses', 'use')} a font that isn’t installed`
    case 'font-unknown':
      return `A font couldn’t be confirmed`
    case 'image-low-resolution':
      return `${plural(L, 'image')} may print blurry`
    case 'image-soft-resolution':
      return `${plural(L, 'image')} ${verb(L, 'prints', 'print')} below 300 DPI`
    case 'artwork-clipped':
      return `${plural(L, 'layer')} ${verb(L, 'is', 'are')} cut at the design edge`
    case 'artwork-off-canvas':
      return `${plural(L, 'layer')} ${verb(L, 'is', 'are')} outside the design`
    case 'hidden-layers':
      return `${plural(L, 'hidden layer')} won’t be exported`
    case 'output-profile-mismatch':
      return 'The printer doesn’t match this design'
    case 'output-profile-layout':
      return 'The printer’s cut runs through the design'
    case 'output-profile-provisional':
      return 'The safe line is guidance, not a measurement'
    case 'safe-area-margin':
      return one ? `${one} is close to the edge` : `${n} items are close to the edge`
    case 'safe-area-trim':
      return one ? `${one} may be trimmed` : `${n} items may be trimmed`
    case 'safe-area-cut':
      return one ? `${one} crosses the cut` : `${n} items cross the cut`
    case 'safe-area-clear':
      return 'Everything important is inside the safe line'
    case 'dslr-no-photo-slots':
      return 'dslrBooth needs at least one photo slot'
    case 'dslr-photo-number-range':
      return 'Photo numbers above dslrBooth’s limit'
    case 'dslr-photo-fit':
      return 'dslrBooth always fills photo slots'
    case 'dslr-photo-opacity':
      return 'Photo transparency isn’t exported'
    case 'dslr-photo-rotation':
      return 'Photo rotation in dslrBooth'
    case 'dslr-resolution':
      return 'Template resolution'
    case 'dslr-flattened':
      return 'Text is exported as part of the picture'
    case 'dslr-two-up':
      return 'Printed two per sheet'
    default: {
      // Unknown code: the first sentence of the finding, never the code itself.
      const first = items[0]?.message.split(/(?<=\.)\s/)[0] ?? ''
      return first.replace(/\.$/, '')
    }
  }
}

function actionsFor(code: string, layerIds: readonly string[]): CheckAction[] {
  const actions: CheckAction[] = []
  if (layerIds.length === 1) actions.push('select')
  else if (layerIds.length > 1) actions.push('select-all')
  if (code.startsWith('output-profile-') || code.startsWith('safe-area-')) actions.push('printer')
  return actions
}

/** Merges findings per code into cards, grouped Error → Needs attention → Good to know. */
export function buildChecks(inputs: readonly CheckInput[]): ChecksModel {
  const byCode = new Map<string, CheckInput[]>()
  for (const i of inputs) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i])
  const cards: CheckCard[] = []
  for (const [code, items] of byCode) {
    // The worst severity of the merged findings is the card's severity (they normally all agree).
    const severity = ORDER.find((s) => items.some((i) => i.severity === s)) ?? 'info'
    const layerIds = [...new Set(items.flatMap((i) => i.layerIds ?? []))]
    const merged = items.length > 1
    cards.push({
      id: code,
      code,
      severity,
      tone: SEVERITY_TONE[severity],
      topic: checkTopic(code),
      title: titleFor(code, items, layerIds.length),
      explanation: merged
        ? `${items.length} findings of the same kind. Select them to review, or open Details.`
        : items[0]!.message,
      layerIds,
      details: items.map((i) => i.message),
      count: items.length,
      actions: actionsFor(code, layerIds)
    })
  }
  const groups: CheckGroup[] = ORDER.map((severity) => ({
    severity,
    tone: SEVERITY_TONE[severity],
    label: STATUS_LABELS[SEVERITY_TONE[severity]],
    cards: cards.filter((c) => c.severity === severity),
    startsCollapsed: severityStartsCollapsed(severity)
  })).filter((g) => g.cards.length > 0)
  const count = (s: PreflightSeverity): number => cards.filter((c) => c.severity === s).length
  const counts = { errors: count('error'), warnings: count('warning'), infos: count('info') }
  return { groups, ...counts, headline: checksHeadline(counts) }
}

/** Button labels for the working actions. */
export function actionLabel(action: CheckAction, card: Pick<CheckCard, 'layerIds'>): string {
  if (action === 'select') return 'Select'
  if (action === 'select-all') return `Select all ${card.layerIds.length}`
  return 'Printer & cutting…'
}

/**
 * The Export dialog's pinned readiness line (B1 mockup 08):
 *   errors   → "Fix 1 error before exporting" (error; Export is blocked)
 *   warnings → "Almost ready · 2 things to look at" (attention; Export allowed)
 *   else     → "Ready to export" (ready; notes are mentioned, never as problems)
 */
export function exportReadiness(counts: { errors: number; warnings: number; infos: number }): {
  tone: StatusTone
  text: string
} {
  if (counts.errors > 0)
    return {
      tone: 'error',
      text: `Fix ${plural(counts.errors, 'error')} before exporting`
    }
  if (counts.warnings > 0)
    return {
      tone: 'attention',
      text: `Almost ready · ${plural(counts.warnings, 'thing')} to look at`
    }
  return {
    tone: 'ready',
    text: counts.infos > 0 ? `Ready to export · ${plural(counts.infos, 'note')}` : 'Ready to export'
  }
}

/** The top-bar Checks button state: a tone and a short text ("Ready", "1 error", "2 need attention"). */
export function checksButtonState(counts: { errors: number; warnings: number; infos: number }): {
  tone: StatusTone
  text: string
} {
  if (counts.errors > 0) return { tone: 'error', text: plural(counts.errors, 'error') }
  if (counts.warnings > 0)
    return {
      tone: 'attention',
      text: `${counts.warnings} ${counts.warnings === 1 ? 'needs' : 'need'} attention`
    }
  return { tone: 'ready', text: 'Ready' }
}
