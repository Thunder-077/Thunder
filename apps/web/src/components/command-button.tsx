"use client"

import { Command } from "lucide-react"
import { Button } from "@/components/ui/button"

export function CommandButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="命令面板"
    >
      <Command className="h-4 w-4" />
    </Button>
  )
}
