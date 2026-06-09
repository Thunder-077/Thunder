import React from "react"
import { createRoot } from "react-dom/client"
import { thunder } from "@thunder/plugin-sdk/browser"

function HelloApp() {
  const [name, setName] = React.useState("")
  const [greeting, setGreeting] = React.useState<string | null>(null)

  async function handleSave() {
    await thunder.storage.set("user-name", name)
    thunder.notification.add({ type: "success", title: "Saved", description: `Hello, ${name}!` })
    setGreeting(`Hello, ${name}!`)
  }

  React.useEffect(() => {
    thunder.storage.get<string>("user-name").then((saved) => {
      if (saved) {
        setName(saved)
        setGreeting(`Welcome back, ${saved}!`)
      }
    })
  }, [])

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>Hello Plugin</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>A minimal Thunder desktop plugin.</p>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          style={{ padding: "6px 10px", borderRadius: 4, border: "1px solid #ccc" }}
        />
        <button
          onClick={handleSave}
          style={{ padding: "6px 14px", borderRadius: 4, background: "#111", color: "#fff", border: "none", cursor: "pointer" }}
        >
          Save
        </button>
      </div>
      {greeting && <p style={{ color: "#333" }}>{greeting}</p>}
    </div>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Missing #root element")
createRoot(rootElement).render(
  <React.StrictMode>
    <HelloApp />
  </React.StrictMode>,
)
