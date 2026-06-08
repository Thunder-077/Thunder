import * as React from "react"

import { cn } from "./cn"

export type CardSize = "default" | "sm"

export function cardClassName(size: CardSize = "default", className?: string) {
  return cn(
    "surface-card group/card flex flex-col overflow-hidden rounded-2xl border border-border/70 text-sm text-card-foreground shadow-xs has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
    size === "default" ? "gap-4 py-4" : "gap-3 py-3",
    className,
  )
}

export function cardContentClassName(size: CardSize = "default", className?: string) {
  return cn(size === "default" ? "px-4" : "px-3", className)
}

export function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: CardSize }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(cardClassName(size), className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-2xl px-4 group-data-[size=sm]/card:px-3 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3",
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", className)}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-4 group-data-[size=sm]/card:px-3", className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-2xl border-t border-border/70 bg-muted/45 p-4 group-data-[size=sm]/card:p-3",
        className,
      )}
      {...props}
    />
  )
}
