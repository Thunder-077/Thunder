interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-[1.4rem] font-semibold tracking-tight text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 self-start sm:self-auto">{actions}</div>}
    </div>
  )
}
