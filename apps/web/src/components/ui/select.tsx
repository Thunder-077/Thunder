"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
}: {
  value: string | number
  onValueChange: (value: string | null) => void
  options: { label: string; value: string | number }[]
  placeholder?: string
  className?: string
}) {
  const stringValue = String(value)

  return (
    <SelectPrimitive.Root value={stringValue} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <SelectPrimitive.ScrollUpArrow className="flex h-4 items-center justify-center text-muted-foreground" />
          <SelectPrimitive.Popup
            className="z-[100] min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:animate-in data-[side=bottom]:slide-in-from-top-2 data-[side=top]:animate-in data-[side=top]:slide-in-from-bottom-2"
          >
            {options.map((option) => (
              <SelectPrimitive.Item
                key={String(option.value)}
                value={String(option.value)}
                className="relative flex h-8 cursor-pointer select-none items-center rounded-sm px-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-1.5 flex items-center">
                  <Check className="h-3.5 w-3.5" />
                </SelectPrimitive.ItemIndicator>
                <span className="pl-6">{option.label}</span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Popup>
          <SelectPrimitive.ScrollDownArrow className="flex h-4 items-center justify-center text-muted-foreground" />
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { Select }
