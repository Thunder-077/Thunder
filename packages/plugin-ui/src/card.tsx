import type { HTMLAttributes } from "react"
import { cn } from "./utils"

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  size?: "sm" | "default"
}

export function Card({ className, size = "default", ...props }: CardProps) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn("rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs", className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn("p-5", className)} {...props} />
}
