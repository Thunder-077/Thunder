"use client"

import { VaultProvider } from "@/modules/vault/state"
import { VaultShell } from "@/modules/vault/components"

export default function VaultPage() {
  return (
    <VaultProvider>
      <VaultShell />
    </VaultProvider>
  )
}
