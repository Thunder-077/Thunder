import { Minus, Plus } from "lucide-react"
import { Button, cn } from "@thunder/ui"

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
    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-border/70">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={decrement}
        className={cn("h-8 w-8 shrink-0 rounded-none border-0 text-muted-foreground hover:bg-muted/50")}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-[3.5rem] select-none text-center text-sm font-medium tabular-nums">
        {formatValue ? formatValue(value) : value}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={increment}
        className={cn("h-8 w-8 shrink-0 rounded-none border-0 text-muted-foreground hover:bg-muted/50")}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
