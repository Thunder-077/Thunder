"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SelectOption = {
  value: string
  label: string
  description?: string
  icon?: ReactNode
  disabled?: boolean
}

type SelectSize = "compact" | "default"

interface SelectProps {
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

function Select({
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
  const resolvedShowDescription = showDescription ?? size === "default"
  const selectedOption = options.find((option) => option.value === value) ?? null
  const triggerSizeClass = size === "compact" ? "h-8 px-3 text-xs rounded-[10px]" : "h-10 px-3.5 text-sm rounded-[11px]"
  const itemBaseClass = size === "compact" ? "min-h-8 px-2.5 py-1.5 text-xs" : "min-h-10 px-3 py-2 text-sm"
  const itemGapClass = size === "compact" ? "gap-2" : "gap-2.5"
  const descriptionClass = size === "compact" ? "text-[10px] leading-4" : "text-xs leading-4"

  return (
    <SelectPrimitive.Root
      value={value ?? undefined}
      disabled={disabled}
      onValueChange={(next) => {
        if (!next) return
        onChange?.(next)
        onValueChange?.(next)
      }}
    >
      <SelectPrimitive.Trigger
        type="button"
        className={cn(
          "inline-flex w-full items-center justify-between gap-2 border bg-background text-foreground transition-colors outline-none",
          "border-border/80 hover:border-border hover:bg-muted/[0.35]",
          "focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-0",
          "data-[popup-open]:border-border data-[popup-open]:bg-muted/[0.45]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerSizeClass,
          error && "border-destructive/60 focus-visible:ring-destructive/25",
          className
        )}
      >
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center",
            selectedOption?.icon ? itemGapClass : ""
          )}
        >
          {selectedOption?.icon && (
            <span className="shrink-0 text-muted-foreground">
              {selectedOption.icon}
            </span>
          )}
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption?.label ?? placeholder}
          </span>
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Positioner
        sideOffset={6}
        alignItemWithTrigger={false}
        className="z-[10000]"
      >
        <SelectPrimitive.ScrollUpArrow className="flex h-4 items-center justify-center text-muted-foreground" />
        <SelectPrimitive.Popup
          className={cn(
            "relative z-[10001] pointer-events-auto min-w-[var(--anchor-width)] overflow-hidden rounded-xl border border-border/70 bg-background p-1 shadow-lg shadow-black/[0.08]",
            "data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-1.5 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-1.5",
            contentClassName
          )}
        >
          {options.map((option) => (
            <SelectPrimitive.Item
              key={String(option.value)}
              value={String(option.value)}
              disabled={option.disabled}
              className={cn(
                "relative flex cursor-pointer select-none items-center rounded-lg pr-8 text-foreground outline-none transition-colors",
                "hover:bg-muted focus:bg-muted data-[highlighted]:bg-muted",
                "data-[selected]:bg-muted/80",
                "data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
                option.icon ? "pl-2.5" : "pl-3",
                itemBaseClass
              )}
            >
              {renderOption ? (
                renderOption(option, { selected: option.value === value, active: false })
              ) : (
                <>
                  <div className={cn("flex min-w-0 flex-1 items-start", option.icon ? itemGapClass : "")}>
                    {option.icon && (
                      <span className="mt-[1px] shrink-0 text-muted-foreground">
                        {option.icon}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-foreground">{option.label}</div>
                      {resolvedShowDescription && option.description && (
                        <div className={cn("mt-0.5 text-muted-foreground", descriptionClass)}>
                          {option.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground">
                    <Check className="h-3.5 w-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </>
              )}
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Popup>
        <SelectPrimitive.ScrollDownArrow className="flex h-4 items-center justify-center text-muted-foreground" />
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Root>
  )
}

export { Select }
