"use client"

import { useCallback, useEffect, useState } from "react"
import {
  DESKTOP_PLUGINS_CHANGED_EVENT,
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

  const refresh = useCallback(
    async (showLoading: boolean) => {
      if (!shouldLoad) {
        setState(initialState)
        return
      }

      if (showLoading) {
        setState((prev) => ({ ...prev, loading: true }))
      }

      try {
        const result = await listDesktopPlugins()
        setState({
          enabled: result.enabled,
          plugins: result.plugins,
          loading: false,
          error: null,
        })
      } catch (error) {
        setState({
          enabled: true,
          plugins: [],
          loading: false,
          error: error instanceof Error ? error.message : "桌面插件加载失败",
        })
      }
    },
    [shouldLoad]
  )

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
          plugins: result.plugins,
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

  useEffect(() => {
    if (!shouldLoad) return

    const handlePluginsChanged = () => {
      void refresh(false)
    }
    window.addEventListener(DESKTOP_PLUGINS_CHANGED_EVENT, handlePluginsChanged)
    window.addEventListener("focus", handlePluginsChanged)
    return () => {
      window.removeEventListener(DESKTOP_PLUGINS_CHANGED_EVENT, handlePluginsChanged)
      window.removeEventListener("focus", handlePluginsChanged)
    }
  }, [refresh, shouldLoad])

  return state
}
