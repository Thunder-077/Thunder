"use client"

import { useEffect } from "react"
import { isTauriDesktop } from "@/lib/platform"

type DesktopPlatform = "macos" | "windows" | "linux"

function detectPlatform(): DesktopPlatform {
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes("mac")) return "macos"
  if (ua.includes("win")) return "windows"
  return "linux"
}

export function useDesktopTitlebar() {
  useEffect(() => {
    if (!isTauriDesktop()) return

    const html = document.documentElement
    const platform = detectPlatform()

    html.classList.add("is-tauri-desktop", `is-${platform}`)

    return () => {
      html.classList.remove("is-tauri-desktop", `is-${platform}`)
    }
  }, [])
}
