import type { LucideIcon } from 'lucide-react'
import { Tooltip } from './Tooltip'

/** Icon-only button. `label` is REQUIRED: it is the accessible name and the tooltip text. */
export function IconButton({
  label,
  hint,
  icon: Icon,
  shortcut,
  onClick,
  disabled,
  pressed,
  active,
  size = 'md',
  tone,
  placement,
  className,
  tabIndex,
  onMouseDown
}: {
  label: string
  hint?: string
  icon: LucideIcon
  shortcut?: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  disabled?: boolean | undefined
  /** Toggle buttons (lock, hide, snap): exposes aria-pressed. */
  pressed?: boolean
  active?: boolean
  size?: 'sm' | 'md'
  tone?: 'warn'
  placement?: 'bottom' | 'right' | 'top' | 'left'
  className?: string
  tabIndex?: number
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  return (
    <Tooltip
      label={label}
      {...(hint ? { hint } : {})}
      {...(shortcut ? { shortcut } : {})}
      {...(placement ? { placement } : {})}
    >
      <button
        type="button"
        className={[
          'ui-iconbtn',
          size === 'sm' ? 'sm' : '',
          tone ?? '',
          active ? 'active' : '',
          className ?? ''
        ]
          .filter(Boolean)
          .join(' ')}
        aria-label={label}
        {...(pressed !== undefined ? { 'aria-pressed': pressed } : {})}
        disabled={disabled}
        tabIndex={tabIndex}
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <Icon size={size === 'sm' ? 15 : 17} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}
