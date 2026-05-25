import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap shadow-xs transition-all duration-normal ease-default outline-none select-none hover:scale-[1.03] focus-visible:ring-[3px] focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:translate-y-0 disabled:scale-100 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground focus-visible:border-ring hover:border-primary hover:bg-primary-foreground hover:text-primary hover:shadow-md dark:border-primary dark:bg-primary dark:text-primary-foreground dark:hover:border-primary-foreground dark:hover:bg-transparent dark:hover:text-primary-foreground dark:hover:shadow-none",
        accent:
          "border-brand/15 bg-brand-subtle text-brand focus-visible:border-brand/40 focus-visible:ring-brand/25 hover:bg-brand-subtle/80 hover:border-brand/25 hover:shadow-md",
        outline:
          "border-border bg-background/88 focus-visible:border-ring hover:bg-muted/75 hover:text-foreground hover:shadow-sm aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/22 dark:hover:bg-input/42 dark:hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border border-transparent focus-visible:border-ring hover:bg-muted hover:text-secondary hover:border-transparent dark:hover:bg-muted dark:hover:text-foreground dark:hover:border-transparent dark:border-border/30",
        ghost:
          "bg-transparent shadow-none focus-visible:border-ring focus-visible:bg-muted/50 hover:bg-muted/82 hover:text-foreground hover:shadow-none aria-expanded:bg-muted aria-expanded:text-foreground dark:focus-visible:bg-muted/10 dark:hover:bg-muted/50",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:border-destructive/40 focus-visible:ring-destructive/20 hover:bg-destructive/92 hover:shadow-md dark:focus-visible:ring-destructive/40",
        "outline-destructive":
          "border-destructive/50 bg-background text-destructive focus-visible:border-destructive/60 focus-visible:ring-destructive/20 hover:border-destructive/70 hover:bg-destructive/5 dark:border-destructive/30 dark:hover:bg-destructive/10",
        link:
          "text-primary underline-offset-4 focus-visible:underline hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
