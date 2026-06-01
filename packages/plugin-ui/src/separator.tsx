import type { HTMLAttributes } from "react"
import { cn } from "./utils"

export type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical"
}

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      data-slot="separator"
      data-orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "w-px self-stretch",
        className
      )}
      {...props}
    />
  )
}
