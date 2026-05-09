"use client"

import * as React from "react"
import { Eye, EyeOff, Copy, Check } from "lucide-react"
import { Button } from "./button"
import { Input } from "./input"
import { cn } from "@/lib/utils"

type PasswordInputProps = React.ComponentProps<"input"> & {
  copyable?: boolean
  onCopyValue?: (value: string) => void | Promise<void>
}

function PasswordInput({
  className,
  copyable = false,
  onCopyValue,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const value = typeof props.value === "string" ? props.value : ""

  // Keep the text cursor inside the input when users toggle visibility or copy.
  const handleAccessoryMouseDown = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
  }

  const handleCopy = async () => {
    if (!value) return
    if (onCopyValue) {
      await onCopyValue(value)
    } else {
      await navigator.clipboard.writeText(value)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="relative group">
      <Input
        type={showPassword ? "text" : "password"}
        className={cn(copyable ? "pr-[78px]" : "pr-12", className)}
        autoComplete="new-password"
        {...props}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg p-0 text-muted-foreground/80 hover:bg-transparent hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/8 transition-none active:!-translate-y-1/2 active:!scale-100",
          copyable ? "right-9" : "right-2"
        )}
        onMouseDown={handleAccessoryMouseDown}
        onClick={() => setShowPassword(!showPassword)}
        aria-label={showPassword ? "隐藏密码" : "显示密码"}
      >
        {showPassword ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
      {copyable && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-lg p-0 text-muted-foreground/80 hover:bg-transparent hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/8 transition-none active:!-translate-y-1/2 active:!scale-100"
          onMouseDown={handleAccessoryMouseDown}
          onClick={handleCopy}
          aria-label="复制密码"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        </Button>
      )}
    </div>
  )
}

export { PasswordInput }
