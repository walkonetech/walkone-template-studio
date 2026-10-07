import type { LucideIcon } from 'lucide-react'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  className,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
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
        variant === 'secondary' ? '' : variant,
        size === 'sm' ? 'sm' : '',
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
