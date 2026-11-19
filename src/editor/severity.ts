import type { PreflightSeverity } from './exportPreflight'

/**
 * The user-facing severity language (Phase 7A, B1 sign-off). The internal levels stay `error` / `warning` / `info`;
 * people see Error / Needs attention / Good to know, and "Ready" when nothing needs fixing. Raw check codes are never
 * part of these labels. "Good to know" items are notes, not problems: a project with only notes reads "Ready · 8 notes".
 */
export type StatusTone = 'error' | 'attention' | 'info' | 'ready'

export const SEVERITY_TONE: Readonly<Record<PreflightSeverity, StatusTone>> = {
  error: 'error',
  warning: 'attention',
  info: 'info'
}

export const STATUS_LABELS: Readonly<Record<StatusTone, string>> = {
  error: 'Error',
  attention: 'Needs attention',
  info: 'Good to know',
  ready: 'Ready'
}

/** Icon names (lucide) per tone; never colour alone. */
export const STATUS_ICONS: Readonly<Record<StatusTone, string>> = {
  error: 'circle-x',
  attention: 'triangle-alert',
  info: 'info',
  ready: 'circle-check'
}

export const severityLabel = (s: PreflightSeverity): string => STATUS_LABELS[SEVERITY_TONE[s]]

/** "Good to know" groups start collapsed; problems start open. */
export const severityStartsCollapsed = (s: PreflightSeverity): boolean => s === 'info'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * The one-line headline for a set of checks and its overall tone:
 *   no errors or warnings → "Ready" or "Ready · 8 notes" (tone ready: notes are never presented as problems);
 *   otherwise the problems only, worst first: "1 error · 2 need attention" (+ notes after them).
 */
export function checksHeadline(counts: { errors: number; warnings: number; infos: number }): {
  tone: StatusTone
  text: string
} {
  const { errors, warnings, infos } = counts
  const notes = infos > 0 ? plural(infos, 'note', 'notes') : ''
  if (errors === 0 && warnings === 0) {
    return { tone: 'ready', text: notes ? `Ready · ${notes}` : 'Ready' }
  }
  const parts = [
    errors ? plural(errors, 'error', 'errors') : '',
    warnings ? `${warnings} ${warnings === 1 ? 'needs' : 'need'} attention` : '',
    notes
  ].filter(Boolean)
  return { tone: errors ? 'error' : 'attention', text: parts.join(' · ') }
}
