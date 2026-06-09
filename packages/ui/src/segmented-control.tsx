import type { ReactNode } from "react"

import { cn } from "./cn"

export type SegmentedOption = {
  value: string
  label: ReactNode
  disabled?: boolean
}

type SegmentedControlProps = {
  value: string
  options: SegmentedOption[]
  onChange: (value: string) => void
  className?: string
  optionClassName?: string
  activeOptionClassName?: string
  inactiveOptionClassName?: string
}

export function SegmentedControl({
  value,
  options,
  onChange,
  className,
  optionClassName,
  activeOptionClassName,
  inactiveOptionClassName,
}: SegmentedControlProps) {
  return (
    <div className={cn("grid gap-2.5", className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-12 cursor-pointer select-none items-center justify-center rounded-xl border p-2 text-center transition-all disabled:pointer-events-none disabled:opacity-50",
              active
                ? "border-primary bg-primary/5 text-primary shadow-[0_0_0_1px_rgba(59,130,246,0.1)]"
                : "border-border bg-background text-muted-foreground hover:bg-muted/40 hover:border-muted-foreground/30",
              active ? activeOptionClassName : inactiveOptionClassName,
              optionClassName,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
