import React from "react"
import { createRoot } from "react-dom/client"
import { TeleprompterPage } from "@/modules/teleprompter/components/teleprompter-page"

const root = document.getElementById("root")

if (!root) {
  throw new Error("Missing plugin root element")
}

createRoot(root).render(
  <React.StrictMode>
    <TeleprompterPage />
  </React.StrictMode>
)
