import {
  CircleCheck,
  CircleHelp,
  CircleX,
  EqualApproximately,
  Eye,
  Folder,
  Image,
  Info,
  Ruler,
  Shapes,
  SquareUser,
  TriangleAlert,
  Type,
  type LucideIcon
} from 'lucide-react'
import type { LayerType } from '@domain'
import { evidenceBadgeModel, type Evidence, type EvidenceTier } from '@output'
import { STATUS_LABELS, type StatusTone } from '@editor/severity'

/**
 * Badges and chips (Phase 7B B2). Every state badge carries an icon AND a word; colour is never the only signal.
 * Tones come from semantic tokens, so they follow the theme without per-component colours.
 */

/** Plain badge: a short label with an optional tone. */
export function Badge({
  children,
  tone = 'neutral',
  className
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'accent' | StatusTone
  className?: string
}): React.JSX.Element {
  return (
    <span className={['ui-badge', `tone-${tone}`, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}

/** A number in a pill ("3"); `label` is the accessible meaning ("3 layers need attention"). */
export function CountBadge({
  count,
  label,
  tone = 'neutral'
}: {
  count: number
  label: string
  tone?: 'neutral' | 'accent' | StatusTone
}): React.JSX.Element {
  return (
    <span className={`ui-count tone-${tone}`} aria-label={label} role="status">
      {count}
    </span>
  )
}

const STATUS_ICON: Record<StatusTone, LucideIcon> = {
  error: CircleX,
  attention: TriangleAlert,
  info: Info,
  ready: CircleCheck
}

/** Severity/status: Error · Needs attention · Good to know · Ready (icon + word + tone). */
export function StatusBadge({
  tone,
  children
}: {
  tone: StatusTone
  /** Overrides the default word (e.g. "Ready · 8 notes"). */
  children?: React.ReactNode
}): React.JSX.Element {
  const Icon = STATUS_ICON[tone]
  return (
    <span className={`ui-status tone-${tone}`} data-tone={tone}>
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      <span>{children ?? STATUS_LABELS[tone]}</span>
    </span>
  )
}

const TIER_ICON: Record<EvidenceTier, LucideIcon> = {
  verified: CircleCheck,
  observed: Eye,
  estimated: EqualApproximately,
  reference: Ruler,
  unknown: CircleHelp
}

/**
 * Evidence (Phase 7A §23): tier icon + the precise level word ("Observed on test laptop") + a subtle tone. Tiers are
 * deliberately close in colour; the icon and word carry the meaning. The hint is the accessible description.
 */
export function EvidenceBadge({
  evidence,
  short
}: {
  evidence: Evidence
  /** Show the tier word ("Observed") instead of the precise level label. */
  short?: boolean
}): React.JSX.Element {
  const m = evidenceBadgeModel(evidence)
  const Icon = TIER_ICON[m.tier]
  return (
    <span
      className={`ui-badge evidence tier-${m.tier}`}
      data-evidence={evidence}
      data-tier={m.tier}
      title={m.hint}
    >
      <Icon size={12} strokeWidth={2} aria-hidden="true" />
      {short ? m.tierLabel : m.label}
    </span>
  )
}

const KIND_ICON: Record<LayerType, LucideIcon> = {
  photo: SquareUser,
  text: Type,
  image: Image,
  shape: Shapes,
  group: Folder
}
const KIND_LABEL: Record<LayerType, string> = {
  photo: 'Photo slot',
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  group: 'Group'
}

/**
 * Element-kind chip for the Layers list and the Properties header only. Kind hues are subdued and never used for
 * selection, focus, navigation, status or primary actions.
 */
export function KindChip({
  kind,
  withLabel
}: {
  kind: LayerType
  withLabel?: boolean
}): React.JSX.Element {
  const Icon = KIND_ICON[kind]
  return (
    <span
      className={`ui-kind kind-${kind}${withLabel ? ' labelled' : ''}`}
      data-kind={kind}
      {...(withLabel ? {} : { role: 'img', 'aria-label': KIND_LABEL[kind] })}
    >
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      {withLabel && <span>{KIND_LABEL[kind]}</span>}
    </span>
  )
}

/** A removable or selectable chip (filters, tags). Pressed state is exposed, not just coloured. */
export function Chip({
  children,
  pressed,
  onClick,
  icon: Icon
}: {
  children: React.ReactNode
  pressed?: boolean
  onClick?: () => void
  icon?: LucideIcon
}): React.JSX.Element {
  if (!onClick)
    return (
      <span className="ui-chip">
        {Icon && <Icon size={13} aria-hidden="true" />}
        {children}
      </span>
    )
  return (
    <button
      type="button"
      className="ui-chip"
      {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
      onClick={onClick}
    >
      {Icon && <Icon size={13} aria-hidden="true" />}
      {children}
    </button>
  )
}
