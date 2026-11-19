import type { LucideIcon } from 'lucide-react'

/**
 * Button hierarchy (B2): `primary` = the one high-emphasis completion action (Export, Import, Done); `secondary` =
 * a visible alternative; `ghost` = low priority; `danger` = destructive (`solid` for the confirming button).
 * Disabled stays readable and is never used to advertise a feature that does not exist yet.
 */

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    /** Extra layout class from the caller (e.g. pushing a button to the start of a footer). */
    className?: string
  }): React.JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      className={[
        'ui-btn',
        variant === 'secondary' ? '' : variant === 'danger-solid' ? 'danger solid' : variant,
        size === 'md' ? '' : size,
        className ?? ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon && <Icon size={15} strokeWidth={1.9} aria-hidden="true" />}
      {children}
    </button>
  )
}
