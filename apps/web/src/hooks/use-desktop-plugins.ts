"use client"

import { useEffect, useState } from "react"
import {
  listDesktopPlugins,
  shouldLoadDesktopPlugins,
  type InstalledDesktopPlugin,
} from "@/lib/desktop-plugins"

interface DesktopPluginState {
  enabled: boolean
  plugins: InstalledDesktopPlugin[]
  loading: boolean
  error: string | null
}

const initialState: DesktopPluginState = {
  enabled: false,
  plugins: [],
  loading: false,
  error: null,
}

export function useDesktopPlugins(): DesktopPluginState {
  const shouldLoad = shouldLoadDesktopPlugins()
  const [state, setState] = useState<DesktopPluginState>(() => ({
    ...initialState,
    loading: shouldLoad,
  }))

  useEffect(() => {
    if (!shouldLoad) {
      return
    }

    let cancelled = false

    listDesktopPlugins()
      .then((result) => {
        if (cancelled) return
        setState({
          enabled: result.enabled,
          plugins: result.plugins.filter((plugin) => plugin.trust.trusted),
          loading: false,
          error: null,
        })
      })
      .catch((error) => {
        if (cancelled) return
        setState({
          enabled: true,
          plugins: [],
          loading: false,
          error: error instanceof Error ? error.message : "桌面插件加载失败",
        })
      })

    return () => {
      cancelled = true
    }
  }, [shouldLoad])

  return state
}
