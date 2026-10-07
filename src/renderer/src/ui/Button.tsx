import type { LucideIcon } from 'lucide-react'

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: LucideIcon
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'>): React.JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      className={['ui-btn', variant === 'secondary' ? '' : variant, size === 'sm' ? 'sm' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {Icon && <Icon size={15} strokeWidth={1.9} aria-hidden="true" />}
      {children}
    </button>
  )
}
