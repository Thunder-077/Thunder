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
        "relative inline-flex h-6 w-11 rounded-full border transition-colors",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
        className,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
          thumbClassName,
        )}
      />
    </button>
  )
}
