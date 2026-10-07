import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  children
}: {
  icon?: LucideIcon
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="ui-empty">
      {Icon && <Icon size={28} strokeWidth={1.4} aria-hidden="true" />}
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
