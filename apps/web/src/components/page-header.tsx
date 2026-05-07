"use client"

import { useEffect } from "react"
import { TopActions } from "@/components/topbar"
import { useAppShellFooter } from "@/components/app-shell"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children?: React.ReactNode
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
  const { setHasPageHeader, onToggleSidebar } = useAppShellFooter()

  useEffect(() => {
    setHasPageHeader(true)
    return () => {
      setHasPageHeader(false)
    }
  }, [setHasPageHeader])

  return (
    <header
      className={cn(
        "mb-4 flex flex-col gap-4 border-b border-border/50 pb-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-3xl">
        <h1 className={cn("text-3xl font-semibold tracking-tight text-foreground", titleClassName)}>
          {title}
        </h1>
        {description && (
          <p className={cn("mt-2 text-sm leading-6 text-muted-foreground", descriptionClassName)}>
            {description}
          </p>
        )}
        {children}
      </div>
      <div className="flex shrink-0 items-center gap-2 self-start sm:pt-0.5">
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <TopActions onToggleSidebar={onToggleSidebar} />
      </div>
    </header>
  )
}
