"use client"

import { useEffect } from "react"

const SPLASH_HIDE_DELAY_MS = 1350
const SPLASH_REMOVE_DELAY_MS = 260

export function BootSplashController() {
  useEffect(() => {
    const splash = document.getElementById("thunder-boot-splash")

    if (!splash) {
      return
    }

    const hideTimer = window.setTimeout(() => {
      splash.dataset.state = "hidden"
    }, SPLASH_HIDE_DELAY_MS)

    const removeTimer = window.setTimeout(() => {
      splash.remove()
    }, SPLASH_HIDE_DELAY_MS + SPLASH_REMOVE_DELAY_MS)

    return () => {
      window.clearTimeout(hideTimer)
      window.clearTimeout(removeTimer)
    }
  }, [])

  return null
}
