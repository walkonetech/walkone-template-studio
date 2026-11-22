import { useMemo } from 'react'
import { ChevronRight, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  actionLabel,
  buildChecks,
  type CheckAction,
  type CheckCard,
  type CheckGroup,
  type CheckInput,
  type ChecksModel
} from '@editor/checks'
import { runExportPreflight } from '@editor/exportPreflight'
import { formatCheckItems } from '@export/formatChecks'
import type { StatusTone } from '@editor/severity'
import { selectViewMode } from '@editor/store'
import { editorStore, useEditor } from './editorStore'
import { fontEnvironment, useFontCatalog } from './fontCatalog'
import { useSafeAreaReport } from './SafeAreaOverlay'
import { layoutStore } from './layoutStore'
import { Button } from '../ui/Button'

/**
 * The shared Checks presentation (Phase 7B B4): severity groups → merged cards with a topic, a plain title, a short
 * explanation, working actions and Details. Used by the Checks panel and the Export dialog, built from ONE model
 * (`@editor/checks`). Groups and Details are native <details> disclosures: keyboard operable, and the content stays
 * in the document while collapsed.
 */

export const TONE_ICON: Record<StatusTone, LucideIcon> = {
  error: CircleX,
  attention: TriangleAlert,
  info: Info,
  ready: CircleCheck
}

/**
 * The project's checks as the Checks panel shows them: the design preflight plus the printer's safe-area findings.
 * "No printer chosen" is not a finding about the design (the Printer & cutting chip says it), so it is left out.
 * Read only; computing them never changes the project.
 */
export function useProjectCheckInputs(): CheckInput[] | null {
  const project = useEditor((s) => s.project)
  const hasOutputProfile = useEditor((s) => s.outputProfileId !== null)
  const safe = useSafeAreaReport()
  const catalog = useFontCatalog()
  return useMemo(() => {
    // `catalog` is read so the checks re-run when installed fonts arrive after launch.
    if (!project || !catalog) return null
    const pre = runExportPreflight(project, { fonts: fontEnvironment() })
    return [
      ...pre.items,
      ...(safe?.items ?? []).filter((i) => i.code !== 'output-profile-none'),
      // Custom format notes (B5.5): never errors.
      ...formatCheckItems(project, { hasOutputProfile })
    ]
  }, [project, safe, catalog, hasOutputProfile])
}

/** The project's checks as a model (null without a project). */
export function useProjectChecks(): ChecksModel | null {
  const inputs = useProjectCheckInputs()
  return useMemo(() => (inputs ? buildChecks(inputs) : null), [inputs])
}

/** Selects the card's layers in Design view (selection is not shown in the read-only Print Preview). */
export function selectCheckLayers(ids: readonly string[]): void {
  const s = editorStore.getState()
  if (selectViewMode(s) === 'preview') s.setViewMode('design')
  s.selectLayers(ids)
}

export interface CheckHandlers {
  /** Select / Select all. */
  onSelect?: (ids: readonly string[]) => void
  /** Printer & cutting… */
  onPrinter?: () => void
}

const defaultHandlers: Required<CheckHandlers> = {
  onSelect: selectCheckLayers,
  onPrinter: () => layoutStore.getState().setOutputProfileOpen(true)
}

function layerNames(ids: readonly string[]): string[] {
  const layers = editorStore.getState().project?.layers ?? []
  return ids.flatMap((id) => {
    const l = layers.find((x) => x.id === id)
    if (!l) return []
    return [l.type === 'text' ? l.content.replace(/\s+/g, ' ').trim() || l.name : l.name]
  })
}

function CardView({
  card,
  handlers
}: {
  card: CheckCard
  handlers: Required<CheckHandlers>
}): React.JSX.Element {
  const Icon = TONE_ICON[card.tone]
  const layers = useEditor((s) => s.project?.layers)
  // Only offer selection for layers that still exist (a working action, never a dead one).
  const live = card.layerIds.filter((id) => layers?.some((l) => l.id === id))
  const actions = card.actions.filter((a) =>
    a === 'printer' ? true : a === 'select' ? live.length === 1 : live.length > 1
  )
  const run = (a: CheckAction): void => {
    if (a === 'printer') handlers.onPrinter()
    else handlers.onSelect(live)
  }
  const names = layerNames(card.layerIds)
  const showDetails = card.count > 1 || names.length > 0
  return (
    <li
      className={`check-card preflight-item ${card.severity}`}
      data-code={card.code}
      data-tone={card.tone}
      data-count={card.count}
    >
      <div className="check-card-top">
        <Icon size={15} strokeWidth={2} aria-hidden="true" className="check-icon" />
        <span className="sr-only">{`${card.tone === 'attention' ? 'Needs attention' : card.tone === 'info' ? 'Good to know' : 'Error'}: `}</span>
        <span className="check-topic preflight-tag">{card.topic}</span>
      </div>
      <p className="check-title">{card.title}</p>
      <p className="check-text">{card.explanation}</p>
      {(actions.length > 0 || showDetails) && (
        <div className="check-actions">
          {actions.map((a) => (
            <Button key={a} size="sm" data-action={a} onClick={() => run(a)}>
              {actionLabel(a, { layerIds: live })}
            </Button>
          ))}
          {showDetails && (
            <details className="check-details">
              <summary>
                Details
                <ChevronRight size={14} aria-hidden="true" className="chev" />
              </summary>
              <div className="check-details-body">
                {names.length > 0 && (
                  <p>
                    <span className="k">{names.length === 1 ? 'Layer' : 'Layers'}</span>{' '}
                    {names.join(', ')}
                  </p>
                )}
                {card.count > 1 && (
                  <ul>
                    {card.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  )
}

function GroupView({
  group,
  handlers,
  open
}: {
  group: CheckGroup
  handlers: Required<CheckHandlers>
  open: boolean
}): React.JSX.Element {
  const Icon = TONE_ICON[group.tone]
  return (
    <details
      className={`check-group tone-${group.tone}`}
      data-severity={group.severity}
      open={open}
    >
      <summary>
        <ChevronRight size={14} aria-hidden="true" className="chev" />
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        <span className="check-group-label">{group.label}</span>
        <span className="check-group-count">{group.cards.length}</span>
      </summary>
      <ul className="check-cards preflight-list" aria-label={group.label}>
        {group.cards.map((c) => (
          <CardView key={c.id} card={c} handlers={handlers} />
        ))}
      </ul>
    </details>
  )
}

/**
 * The groups of a checks model. Error and Needs attention start open; Good to know starts collapsed (it never looks
 * like a failure). `openAll` opens every group (used when Export asks to review an error).
 */
export function CheckGroups({
  model,
  handlers,
  emptyText = 'Nothing needs fixing.'
}: {
  model: ChecksModel
  handlers?: CheckHandlers
  emptyText?: string
}): React.JSX.Element {
  const h = { ...defaultHandlers, ...handlers }
  if (model.groups.length === 0)
    return (
      <p className="checks-empty">
        <CircleCheck size={16} aria-hidden="true" className="ok" />
        {emptyText}
      </p>
    )
  return (
    <div className="check-groups">
      {model.groups.map((g) => (
        <GroupView key={g.severity} group={g} handlers={h} open={!g.startsCollapsed} />
      ))}
    </div>
  )
}

/** "1 error · 3 need attention · 2 good to know" as status chips (icon + word + count), or "Ready · 4 notes". */
export function CheckCounts({ model }: { model: ChecksModel }): React.JSX.Element {
  if (model.errors === 0 && model.warnings === 0) {
    return (
      <div className="check-counts" data-tone="ready">
        <span className="ui-status tone-ready">
          <CircleCheck size={13} strokeWidth={2} aria-hidden="true" />
          <span>{model.headline.text}</span>
        </span>
      </div>
    )
  }
  const parts: [StatusTone, number, string][] = [
    ['error', model.errors, model.errors === 1 ? 'error' : 'errors'],
    ['attention', model.warnings, model.warnings === 1 ? 'needs attention' : 'need attention'],
    ['info', model.infos, 'good to know']
  ]
  return (
    <div className="check-counts" data-tone={model.headline.tone}>
      {parts
        .filter(([, n]) => n > 0)
        .map(([tone, n, word]) => {
          const Icon = TONE_ICON[tone]
          return (
            <span key={tone} className={`check-count tone-${tone}`}>
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              {n} {word}
            </span>
          )
        })}
    </div>
  )
}
