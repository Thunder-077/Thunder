"use client"

import { useCallback, useRef } from "react"
import { platform } from "@thunder/platform"

export function useClipboardProtection(
  enabled: boolean,
  clearAfterSeconds: number
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCopiedRef = useRef<string | null>(null)

  const copyWithProtection = useCallback(
    async (text: string, isPassword: boolean) => {
      await platform.writeClipboardText(text)

      if (isPassword && enabled && clearAfterSeconds > 0) {
        lastCopiedRef.current = text
        if (timerRef.current) clearTimeout(timerRef.current)

        timerRef.current = setTimeout(async () => {
          try {
            const current = await platform.readClipboardText()
            if (current === lastCopiedRef.current) {
              await platform.writeClipboardText("")
            }
          } catch {
            // clipboard read permission denied - cannot verify, skip clearing
          }
          lastCopiedRef.current = null
        }, clearAfterSeconds * 1000)
      }
    },
    [enabled, clearAfterSeconds]
  )

  return { copyWithProtection }
}
