import React from "react"
import { createRoot } from "react-dom/client"
import { thunder } from "@thunder/plugin-sdk/browser"

function __PLUGIN_COMPONENT__App() {
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    thunder.storage.get<number>("count").then((value) => setCount(value ?? 0))
  }, [])

  async function increment() {
    const next = count + 1
    await thunder.storage.set("count", next)
    setCount(next)
    thunder.notification.add({ title: "__PLUGIN_NAME__", description: `Count: ${next}` })
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>__PLUGIN_NAME__</h1>
      <p>Sandboxed plugin count: {count}</p>
      <button type="button" onClick={increment}>Increment</button>
    </main>
  )
}

const rootElement = document.getElementById("root")
if (!rootElement) throw new Error("Missing #root element")
createRoot(rootElement).render(<__PLUGIN_COMPONENT__App />)
