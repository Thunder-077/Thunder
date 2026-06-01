import type { ButtonHTMLAttributes } from "react"
import { cn } from "./utils"

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "default"
}

export function Switch({
  className,
  checked = false,
  disabled,
  onCheckedChange,
  size = "default",
  type = "button",
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      data-size={size}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-[14px] w-[24px]" : "h-[18.4px] w-[32px]",
        checked ? "bg-primary" : "bg-input",
        className
      )}
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked)
        }
      }}
      {...props}
    >
      <span
        className={cn(
          "pointer-events-none block rounded-full bg-background transition-transform",
          size === "sm" ? "size-3" : "size-4",
          checked ? "translate-x-[calc(100%-2px)]" : "translate-x-0"
        )}
      />
    </button>
  )
}
