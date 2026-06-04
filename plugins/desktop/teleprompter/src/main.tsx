import React from "react"
import { createRoot } from "react-dom/client"
import { thunder } from "@thunder/plugin-sdk/browser"
import { TeleprompterPage } from "@/modules/teleprompter/components/teleprompter-page"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Missing plugin root element")
}

function PluginFrameAutoHeight() {
  React.useEffect(() => {
    const reportHeight = () => {
      const bodyHeight = document.body?.scrollHeight ?? 0
      const documentHeight = document.documentElement?.scrollHeight ?? 0
      thunder.plugin.setFrameHeight(Math.max(bodyHeight, documentHeight))
    }

    reportHeight()

    const resizeObserver = new ResizeObserver(() => {
      reportHeight()
    })

    if (document.body) resizeObserver.observe(document.body)
    if (document.documentElement) resizeObserver.observe(document.documentElement)

    window.addEventListener("load", reportHeight)
    window.addEventListener("resize", reportHeight)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("load", reportHeight)
      window.removeEventListener("resize", reportHeight)
    }
  }, [])

  return null
}

function PluginThemeSync() {
  React.useEffect(() => {
    const unsubscribe = thunder.theme.onChange((theme) => {
      document.documentElement.classList.toggle("dark", theme === "dark")
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    })
    return unsubscribe
  }, [])

  return null
}

createRoot(root).render(
  <React.StrictMode>
    <PluginFrameAutoHeight />
    <PluginThemeSync />
    <TeleprompterPage />
  </React.StrictMode>
)
