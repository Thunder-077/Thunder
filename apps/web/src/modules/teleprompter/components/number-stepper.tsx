"use client"

import { Minus, Plus } from "lucide-react"

type NumberStepperProps = {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  formatValue?: (v: number) => string
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  formatValue,
}: NumberStepperProps) {
  const decrement = () => onChange(Math.max(min, +(value - step).toFixed(4)))
  const increment = () => onChange(Math.min(max, +(value + step).toFixed(4)))

  return (
    <div className="flex items-center shrink-0 overflow-hidden rounded-lg border border-border/70">
      <button
        type="button"
        onClick={decrement}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-[3.5rem] select-none text-center text-sm font-medium tabular-nums">
        {formatValue ? formatValue(value) : value}
      </span>
      <button
        type="button"
        onClick={increment}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
