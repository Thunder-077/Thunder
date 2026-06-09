import React from "react"
import { createRoot } from "react-dom/client"
import { thunder } from "@thunder/plugin-sdk/browser"

function __PLUGIN_COMPONENT__App() {
  const [manifest, setManifest] = React.useState<unknown>(null)
  const [permission, setPermission] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    thunder.plugin
      .getManifest()
      .then((m) => {
        if (!cancelled) setManifest(m)
      })
      .catch((error) => {
        if (!cancelled) setPermission(String(error))
      })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>__PLUGIN_NAME__</h1>
      <p style={{ color: "#666" }}>Hello from your Thunder plugin.</p>
      <pre
        style={{
          marginTop: 12,
          padding: 8,
          background: "#f5f5f5",
          borderRadius: 4,
          fontSize: 12,
          overflow: "auto",
        }}
      >
        {permission ?? JSON.stringify(manifest, null, 2)}
      </pre>
    </div>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) {
  throw new Error("Missing #root element")
}

createRoot(rootElement).render(
  <React.StrictMode>
    <__PLUGIN_COMPONENT__App />
  </React.StrictMode>,
)
