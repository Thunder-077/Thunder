"use client"

import { useCallback, useSyncExternalStore } from "react"
import {
  type VaultSettings,
  DEFAULT_VAULT_SETTINGS,
} from "@thunder/vault"

const STORAGE_KEY = "thunder:module:vault:settings"

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getStoredSettings(): VaultSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_VAULT_SETTINGS
    return { ...DEFAULT_VAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_VAULT_SETTINGS
  }
}

function saveSettings(settings: VaultSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  listeners.forEach((cb) => cb())
}

function getSnapshot(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ""
}

function getServerSnapshot(): string {
  return ""
}

export function useVaultSettings() {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const settings = getStoredSettings()

  const updateSettings = useCallback((partial: Partial<VaultSettings>) => {
    const current = getStoredSettings()
    saveSettings({ ...current, ...partial })
  }, [])

  const resetSettings = useCallback(() => {
    saveSettings(DEFAULT_VAULT_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings }
}
