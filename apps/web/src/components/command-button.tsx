"use client"

import { Command } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCommandPalette } from "@/components/command-palette"

export function CommandButton() {
  const { setOpen } = useCommandPalette()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      aria-label="命令面板"
      onClick={() => setOpen(true)}
    >
      <Command className="h-4 w-4" />
    </Button>
  )
}
