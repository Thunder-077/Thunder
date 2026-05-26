"use client"

import { useEffect } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import {
  type DesktopPlatform,
  getTauriDesktopPlatform,
  isTauriDesktop,
} from "@/lib/platform"

const WINDOWS_TITLEBAR_PHYSICAL_HEIGHT = 57
const MACOS_TITLEBAR_HEIGHT = 28
const DEFAULT_TITLEBAR_HEIGHT = 38

function resolveTitlebarHeight(platform: DesktopPlatform, scaleFactor: number): number {
  if (platform === "macos") {
    return MACOS_TITLEBAR_HEIGHT
  }

  if (platform === "windows") {
    // Overlay caption buttons on Windows scale in physical pixels, so keep
    // the reserved drag strip stable in device pixels across DPI changes.
    const logicalHeight = Math.round(WINDOWS_TITLEBAR_PHYSICAL_HEIGHT / scaleFactor)
    return Math.min(48, Math.max(34, logicalHeight))
  }

  return DEFAULT_TITLEBAR_HEIGHT
}

export function useDesktopTitlebar() {
  useEffect(() => {
    if (!isTauriDesktop()) {
      return
    }

    const html = document.documentElement
    const currentWindow = getCurrentWindow()
    let activePlatform: DesktopPlatform | null = null
    let unlistenScale: (() => void) | null = null
    let disposed = false

    const applyTitlebarHeight = async (platform: DesktopPlatform) => {
      const scaleFactor = await currentWindow.scaleFactor()
      if (disposed) {
        return
      }

      html.style.setProperty(
        "--desktop-titlebar-height",
        `${resolveTitlebarHeight(platform, scaleFactor)}px`,
      )
    }

    const setupDesktopTitlebar = async () => {
      const platform = await getTauriDesktopPlatform()
      if (!platform) {
        return
      }

      if (disposed) {
        return
      }

      activePlatform = platform
      html.classList.add("is-tauri-desktop", `is-${platform}`)

      if (platform === "linux") {
        html.style.removeProperty("--desktop-titlebar-height")
        return
      }

      await applyTitlebarHeight(platform)
      unlistenScale = await currentWindow.onScaleChanged(({ payload }) => {
        html.style.setProperty(
          "--desktop-titlebar-height",
          `${resolveTitlebarHeight(platform, payload.scaleFactor)}px`,
        )
      })
    }

    void setupDesktopTitlebar()

    return () => {
      disposed = true

      if (unlistenScale) {
        unlistenScale()
      }

      html.style.removeProperty("--desktop-titlebar-height")
      if (activePlatform) {
        html.classList.remove("is-tauri-desktop", `is-${activePlatform}`)
      }
    }
  }, [])
}
