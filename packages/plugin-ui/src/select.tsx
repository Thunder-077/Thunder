"use client"

import { Check, ChevronDown } from "lucide-react"
import { useState, type FocusEvent, type ReactNode } from "react"
import { cn } from "./utils"

export type SelectOption = {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

type SelectSize = "compact" | "default"

export type SelectProps = {
  value?: string | null
  options: SelectOption[]
  onChange?: (value: string) => void
  onValueChange?: (value: string | null) => void
  placeholder?: string
  size?: SelectSize
  disabled?: boolean
  error?: boolean
  className?: string
  contentClassName?: string
  showDescription?: boolean
  renderOption?: (option: SelectOption, ctx: { selected: boolean; active: boolean }) => ReactNode
}

export function Select({
  value = null,
  options,
  onChange,
  onValueChange,
  placeholder = "请选择",
  size = "default",
  disabled = false,
  error = false,
  className,
  contentClassName,
  showDescription,
  renderOption,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const resolvedShowDescription = showDescription ?? size === "default"
  const selectedOption = options.find((option) => option.value === value) ?? null
  const triggerSizeClass = size === "compact" ? "h-8 rounded-lg px-3 text-xs" : "h-10 rounded-xl px-3.5 text-sm"
  const itemBaseClass = size === "compact" ? "min-h-8 px-2.5 py-1.5 text-xs" : "min-h-10 px-3 py-2 text-sm"
  const itemGapClass = size === "compact" ? "gap-2" : "gap-2.5"
  const descriptionClass = "text-xs leading-4"

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
    }
  }

  return (
    <div className="relative" onBlur={handleBlur}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 border bg-background/85 text-foreground shadow-xs transition-all duration-normal ease-default outline-none",
          "border-border/80 hover:border-border hover:bg-muted/[0.45]",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/28 focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerSizeClass,
          error && "border-destructive/60 focus-visible:ring-destructive/25",
          className
        )}
      >
        <span className={cn("flex min-w-0 flex-1 items-center", selectedOption?.icon ? itemGapClass : "")}>
          {selectedOption?.icon && <span className="shrink-0 text-muted-foreground">{selectedOption.icon}</span>}
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {!disabled && options.length > 0 && open && (
        <div
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+6px)] z-[var(--z-dropdown)] min-w-full overflow-hidden rounded-2xl border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-lg",
            contentClassName
          )}
        >
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onMouseDown={(event) => {
                  event.preventDefault()
                  if (option.disabled) return
                  onChange?.(option.value)
                  onValueChange?.(option.value)
                  setOpen(false)
                }}
                className={cn(
                  "relative flex w-full cursor-pointer select-none items-center rounded-lg pr-8 text-left text-foreground outline-none transition-colors",
                  "hover:bg-muted/85 focus:bg-muted/85",
                  "disabled:pointer-events-none disabled:opacity-45",
                  selected && "bg-brand-subtle/75",
                  option.icon ? "pl-2.5" : "pl-3",
                  itemBaseClass
                )}
              >
                {renderOption ? (
                  renderOption(option, { selected, active: false })
                ) : (
                  <>
                    <div className={cn("flex min-w-0 flex-1 items-start", option.icon ? itemGapClass : "")}>
                      {option.icon && <span className="mt-[1px] shrink-0 text-muted-foreground">{option.icon}</span>}
                      <div className="min-w-0">
                        <div className="truncate text-foreground">{option.label}</div>
                        {resolvedShowDescription && option.description && (
                          <div className={cn("mt-0.5 text-muted-foreground", descriptionClass)}>
                            {option.description}
                          </div>
                        )}
                      </div>
                    </div>
                    {selected && <Check className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />}
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
