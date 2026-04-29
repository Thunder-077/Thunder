import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-xl border border-input bg-background/85 px-4 py-2 text-sm text-base shadow-xs outline-none transition-all duration-normal ease-default file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground placeholder:transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:bg-muted/65 disabled:text-muted-foreground disabled:opacity-100 aria-invalid:border-destructive/70 aria-invalid:ring-[3px] aria-invalid:ring-destructive/18 dark:disabled:bg-muted/35",
        className
      )}
      {...props}
    />
  )
}

export { Input }
