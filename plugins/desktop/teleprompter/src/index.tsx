import React from "react"
import { createRoot } from "react-dom/client"
import { thunder } from "@thunder/plugin-sdk/browser"
import { TeleprompterPanel } from "./features/teleprompter-panel"

/**
 * 提词器插件 UI 入口。
 *
 * 该文件是 iframe 加载的浏览器入口 (`dist/index.html` -> `assets/main.js`),
 * 不再走 `definePlugin({ setup })` 模板 — 没有任何宿主进程会调 `setup`,
 * 必须在此处直接把 React 树挂到 `#root`,并通过 Host Bridge 上报 frame 高度。
 */
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

const root = document.getElementById("root")

if (!root) {
  throw new Error("Missing plugin root element")
}

createRoot(root).render(
  <React.StrictMode>
    <PluginFrameAutoHeight />
    <TeleprompterPanel />
  </React.StrictMode>
)
