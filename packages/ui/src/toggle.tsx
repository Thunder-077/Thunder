import { cn } from "./cn"

type ToggleProps = {
  checked: boolean
  onChange: (value: boolean) => void
  className?: string
  thumbClassName?: string
}

export function Toggle({ checked, onChange, className, thumbClassName }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform shadow-sm",
          checked ? "translate-x-5" : "translate-x-0",
          thumbClassName,
        )}
      />
    </button>
  )
}
