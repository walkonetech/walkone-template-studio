import { CircleX, Info, TriangleAlert } from 'lucide-react'

/** Preflight rows shared by the Export dialog and the Output profile dialog (error / warning / info + optional tag). */
export type CheckSeverity = 'error' | 'warning' | 'info'

export interface CheckItem {
  code: string
  severity: CheckSeverity
  message: string
  /** Small tag naming where the check comes from ("dslrBooth", "Output"). */
  tag?: string
}

const ICONS = { error: CircleX, warning: TriangleAlert, info: Info } as const
export const SEVERITY_ORDER: Record<CheckSeverity, number> = { error: 0, warning: 1, info: 2 }

export function PreflightRow({ item }: { item: CheckItem }): React.JSX.Element {
  const Icon = ICONS[item.severity]
  return (
    <li className={`preflight-item ${item.severity}`} data-code={item.code}>
      <Icon size={14} aria-hidden="true" />
      <span>
        <span className="sr-only">{item.severity}: </span>
        {item.tag && <span className="preflight-tag">{item.tag}</span>}
        {item.message}
      </span>
    </li>
  )
}

export function checkSummary(items: readonly CheckItem[]): string {
  if (items.length === 0) return 'No problems found.'
  const count = (s: CheckSeverity): number => items.filter((i) => i.severity === s).length
  const [e, w, n] = [count('error'), count('warning'), count('info')]
  const parts = [
    e ? `${e} ${e === 1 ? 'error' : 'errors'}` : '',
    w ? `${w} ${w === 1 ? 'warning' : 'warnings'}` : '',
    n ? `${n} ${n === 1 ? 'note' : 'notes'}` : ''
  ].filter(Boolean)
  return parts.join(' · ')
}
