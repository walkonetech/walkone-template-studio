import type { ExportKind } from '@export/naming'
import type { ExportOutput } from './exportPlan'

/**
 * The Export dialog's picture cards (Phase 7B B4, B1 mockup 08 round 2). Three things people ask for, each mapped to
 * the existing outputs underneath (nothing about the files themselves changes):
 *   For the booth → the dslrBooth template (the main one: native 2×6 strip, sheet or single design)
 *   Print files   → the print sheet PNG, plus the single design PNG when the sheet holds copies
 *   Client proof  → the proof PNG (numbered photo-slot placeholders; never a picture)
 * Lower-frequency outputs (the 4×6 dslrBooth template, single files on their own) stay under More options.
 * First use (owner decision R2): For the booth ON, Print files OFF, Client proof OFF. The selection is dialog state
 * only: it is never stored in the project.
 */

export type ExportCardId = 'booth' | 'print' | 'proof'

export interface ExportCard {
  id: ExportCardId
  title: string
  description: string
  /** The outputs this card turns on and off (only those the project offers). */
  kinds: ExportKind[]
}

export const FIRST_USE_KINDS: readonly ExportKind[] = ['dslrbooth']

const inches = (n: number): string => String(Math.round(n * 100) / 100)
const size = (o: Pick<ExportOutput, 'widthIn' | 'heightIn'>): string =>
  `${inches(o.widthIn)}×${inches(o.heightIn)}`

export function exportCards(outputs: readonly ExportOutput[]): ExportCard[] {
  const by = (k: ExportKind): ExportOutput | undefined => outputs.find((o) => o.kind === k)
  const booth = by('dslrbooth')
  const print = by('print')
  const design = by('design')
  const proof = by('proof')
  const cards: ExportCard[] = []
  if (booth)
    cards.push({
      id: 'booth',
      title: 'For the booth',
      description: by('dslrbooth-4x6')
        ? 'A dslrBooth template. The booth prints it two per sheet.'
        : 'A dslrBooth template, ready for the booth.',
      kinds: ['dslrbooth']
    })
  if (print)
    cards.push({
      id: 'print',
      title: 'Print files',
      description: design
        ? `The ${size(print)} sheet and the single ${size(design)} design as pictures.`
        : `The ${size(print)} print as a picture.`,
      kinds: design ? ['print', 'design'] : ['print']
    })
  if (proof)
    cards.push({
      id: 'proof',
      title: 'Client proof',
      description: 'A preview to send for approval, with numbered photo slots. Not for printing.',
      kinds: ['proof']
    })
  return cards
}

/** The first-use selection among the outputs a project offers. */
export function firstUseSelection(outputs: readonly ExportOutput[]): ExportKind[] {
  const booth = outputs.filter((o) => FIRST_USE_KINDS.includes(o.kind)).map((o) => o.kind)
  if (booth.length > 0) return booth
  // No dslrBooth template for this format (B5.5 custom size): the print files are what there is to export.
  return outputs.filter((o) => o.kind === 'print' || o.kind === 'design').map((o) => o.kind)
}

export type CardState = 'on' | 'off' | 'mixed'

export function cardState(card: ExportCard, selected: readonly ExportKind[]): CardState {
  const on = card.kinds.filter((k) => selected.includes(k)).length
  return on === 0 ? 'off' : on === card.kinds.length ? 'on' : 'mixed'
}

/** Clicking a card: an off card turns all of its outputs on; an on (or partly on) card turns them all off. */
export function toggleCard(card: ExportCard, selected: readonly ExportKind[]): ExportKind[] {
  return cardState(card, selected) === 'off'
    ? [...selected, ...card.kinds.filter((k) => !selected.includes(k))]
    : selected.filter((k) => !card.kinds.includes(k))
}

/** "Creates 3 files: Ava & Theo.zip · Ava & Theo-print.png · …" in the dialog's output order. */
export function filesSummary(
  outputs: readonly ExportOutput[],
  selected: readonly ExportKind[]
): { count: number; text: string; names: string[] } {
  const names = outputs.filter((o) => selected.includes(o.kind)).map((o) => o.fileName)
  const count = names.length
  if (count === 0) return { count, names, text: 'Choose at least one thing to export.' }
  return { count, names, text: `Creates ${count === 1 ? '1 file' : `${count} files`}` }
}

/** The Export button's words: "Export 1 file…" / "Export 3 files…" (the folder is chosen next). */
export const exportButtonLabel = (count: number): string =>
  count === 0 ? 'Export…' : `Export ${count === 1 ? '1 file' : `${count} files`}…`
