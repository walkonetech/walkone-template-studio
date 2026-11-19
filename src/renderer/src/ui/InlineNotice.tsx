import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { StatusTone } from '@editor/severity'

const ICON: Record<StatusTone, LucideIcon> = {
  error: CircleX,
  attention: TriangleAlert,
  info: Info,
  ready: CircleCheck
}

/**
 * A short message inside a panel or dialog (banner). Icon + text + tone; errors are announced (role=alert), the rest
 * are polite status. `actions` holds real, working actions only: never a disabled placeholder for a future feature.
 */
export function InlineNotice({
  tone,
  title,
  children,
  actions
}: {
  tone: StatusTone
  title?: string
  children?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  const Icon = ICON[tone]
  return (
    <div className={`ui-notice tone-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={2} aria-hidden="true" className="ui-notice-icon" />
      <div className="ui-notice-text">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
      {actions && <div className="ui-notice-actions">{actions}</div>}
    </div>
  )
}
