import React, { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
  titleClassName?: string
  descriptionClassName?: string
}

export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
  titleClassName,
  descriptionClassName,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-4 flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 max-w-3xl">
        <h1 className={cn("text-3xl font-semibold tracking-tight text-foreground", titleClassName)}>{title}</h1>
        {description && <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", descriptionClassName)}>{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 self-start sm:pt-0.5">{actions}</div>}
    </header>
  )
}
