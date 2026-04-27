import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-4 text-sm text-foreground shadow-none transition-[border-color,box-shadow,background-color] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-muted-foreground/30 focus-visible:border-muted-foreground/50 focus-visible:ring-[3px] focus-visible:ring-black/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-80 aria-invalid:border-destructive/50 aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 dark:focus-visible:ring-white/10 dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
