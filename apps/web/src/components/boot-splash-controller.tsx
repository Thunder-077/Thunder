"use client"

import { useEffect } from "react"

const SPLASH_MIN_VISIBLE_MS = 900

export function BootSplashController() {
  useEffect(() => {
    const splash = document.getElementById("thunder-boot-splash")

    if (!splash) {
      return
    }

    let hideTimer: number | undefined

    const hideSplash = () => {
      splash.dataset.state = "hidden"
    }

    // Keep the brand moment intentional, then let CSS fade the React-owned node out.
    const scheduleHide = () => {
      hideTimer = window.setTimeout(hideSplash, SPLASH_MIN_VISIBLE_MS)
    }

    if (document.readyState === "complete") {
      scheduleHide()
    } else {
      window.addEventListener("load", scheduleHide, { once: true })
    }

    return () => {
      window.removeEventListener("load", scheduleHide)

      if (hideTimer) {
        window.clearTimeout(hideTimer)
      }
    }
  }, [])

  return null
}
