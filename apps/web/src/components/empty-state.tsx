import { Inbox } from "lucide-react"

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="surface-panel mx-auto flex max-w-md flex-col items-center justify-center rounded-[24px] border border-panel-border px-6 py-14 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-subtle text-brand shadow-xs">
        {icon || <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-base font-medium tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
