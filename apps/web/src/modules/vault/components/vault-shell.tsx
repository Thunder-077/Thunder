"use client"

import { useState } from "react"
import { useVault } from "../state"
import { VaultSetupPage } from "./vault-setup-page"
import { VaultUnlockPage } from "./vault-unlock-page"
import { VaultMainPage } from "./vault-main-page"
import { VaultSettingsPage } from "./vault-settings-page"

export function VaultShell() {
  const { status } = useVault()
  const [showSettings, setShowSettings] = useState(false)

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  if (status === "setup") {
    return <VaultSetupPage />
  }

  if (status === "locked") {
    return <VaultUnlockPage />
  }

  if (showSettings) {
    return <VaultSettingsPage onBack={() => setShowSettings(false)} />
  }

  return <VaultMainPage onOpenSettings={() => setShowSettings(true)} />
}
