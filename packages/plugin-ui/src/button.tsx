import type { ButtonHTMLAttributes } from "react"
import { cn } from "./utils"

export type ButtonVariant =
  | "primary"
  | "accent"
  | "outline"
  | "secondary"
  | "ghost"
  | "destructive"
  | "outline-destructive"
  | "link"

export type ButtonSize = "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-primary bg-primary text-primary-foreground hover:border-primary hover:bg-primary-foreground hover:text-primary hover:shadow-md",
  accent: "border-brand/15 bg-brand-subtle text-brand hover:bg-brand-subtle/80 hover:border-brand/25 hover:shadow-md",
  outline: "border-border bg-background/88 hover:bg-muted/75 hover:text-foreground hover:shadow-sm",
  secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-muted",
  ghost: "border-transparent bg-transparent shadow-none hover:bg-muted/82 hover:text-foreground",
  destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/92 hover:shadow-md",
  "outline-destructive": "border-destructive/50 bg-background text-destructive hover:border-destructive/70 hover:bg-destructive/5",
  link: "border-transparent bg-transparent p-0 text-primary shadow-none hover:underline",
}

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-8 gap-1.5 px-2.5",
  xs: "h-6 gap-1 rounded-lg px-2 text-xs",
  sm: "h-7 gap-1 rounded-lg px-2.5 text-[0.8rem]",
  lg: "h-9 gap-1.5 px-2.5",
  icon: "size-8",
  "icon-xs": "size-6 rounded-lg",
  "icon-sm": "size-7 rounded-lg",
  "icon-lg": "size-9",
}

export function Button({
  className,
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-slot="button"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border text-sm font-medium whitespace-nowrap shadow-xs transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
}
