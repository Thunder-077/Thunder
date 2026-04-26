"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import type { VaultMetadata, VaultItemPlain, VaultBackup } from "@thunder/vault"
import { VaultClient } from "@thunder/api-client"
import { VaultCryptoWeb, VaultCryptoError } from "../crypto"
import type { IVaultCrypto } from "../crypto"
import { useAutoLock } from "../hooks/use-auto-lock"
import { useVaultSettings } from "../hooks/use-vault-settings"

type VaultStatus = "loading" | "setup" | "locked" | "unlocked"

interface VaultContextValue {
  status: VaultStatus
  metadata: VaultMetadata | null
  items: VaultItemPlain[]
  selectedItem: VaultItemPlain | null
  loading: boolean
  error: string | null
  selectItem: (item: VaultItemPlain | null) => void
  createVault: (masterPassword: string) => Promise<void>
  unlockVault: (masterPassword: string) => Promise<void>
  lockVault: () => void
  addItem: (item: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => Promise<void>
  updateItem: (item: VaultItemPlain) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  clearVault: () => Promise<void>
  exportBackup: () => Promise<string>
  importBackup: (json: string) => Promise<void>
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined)

const vaultClient = new VaultClient()
const vaultCrypto: IVaultCrypto = new VaultCryptoWeb()

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<VaultStatus>("loading")
  const [metadata, setMetadata] = useState<VaultMetadata | null>(null)
  const [dataKey, setDataKey] = useState<string | null>(null)
  const [items, setItems] = useState<VaultItemPlain[]>([])
  const [selectedItem, setSelectedItem] = useState<VaultItemPlain | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { settings } = useVaultSettings()

  useEffect(() => {
    vaultClient.getMetadata().then((meta) => {
      if (meta) {
        setMetadata(meta)
        setStatus("locked")
      } else {
        setStatus("setup")
      }
    }).catch(() => {
      setStatus("setup")
    })
  }, [])

  const lockVault = useCallback(() => {
    setDataKey(null)
    setItems([])
    setSelectedItem(null)
    setError(null)
    setStatus("locked")
  }, [])

  useAutoLock(settings.autoLockMinutes, lockVault, status === "unlocked")

  const createVault = useCallback(async (masterPassword: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await vaultCrypto.createVault(masterPassword)
      await vaultClient.saveMetadata(result.metadata)
      setMetadata(result.metadata)
      setDataKey(result.dataKey)
      setItems([])
      setStatus("unlocked")
    } catch {
      setError("创建保险箱失败")
    } finally {
      setLoading(false)
    }
  }, [])

  const unlockVault = useCallback(async (masterPassword: string) => {
    if (!metadata) return
    setLoading(true)
    setError(null)
    try {
      const result = await vaultCrypto.unlockVault(masterPassword, metadata)
      const records = await vaultClient.listItems(metadata.id)
      const decrypted = await Promise.all(
        records.map((r) => vaultCrypto.decryptVaultItem(result.dataKey, r))
      )
      setDataKey(result.dataKey)
      setItems(decrypted)
      setStatus("unlocked")
    } catch (e) {
      if (e instanceof VaultCryptoError) {
        setError(e.message)
      } else {
        setError("主密码错误或保险箱数据无效")
      }
    } finally {
      setLoading(false)
    }
  }, [metadata])

  const addItem = useCallback(
    async (item: Omit<VaultItemPlain, "id" | "createdAt" | "updatedAt">) => {
      if (!metadata || !dataKey) return
      setLoading(true)
      setError(null)
      try {
        const now = new Date().toISOString()
        const plain: VaultItemPlain = { ...item, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
        const record = await vaultCrypto.encryptVaultItem(dataKey, plain, metadata.id)
        await vaultClient.saveItem(record)
        setItems((prev) => [...prev, plain])
        setSelectedItem(plain)
      } catch {
        setError("新增条目失败")
      } finally {
        setLoading(false)
      }
    },
    [metadata, dataKey]
  )

  const updateItem = useCallback(
    async (item: VaultItemPlain) => {
      if (!metadata || !dataKey) return
      setLoading(true)
      setError(null)
      try {
        const updated = { ...item, updatedAt: new Date().toISOString() }
        const record = await vaultCrypto.encryptVaultItem(dataKey, updated, metadata.id)
        await vaultClient.saveItem(record)
        setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)))
        if (selectedItem?.id === item.id) setSelectedItem(updated)
      } catch {
        setError("更新条目失败")
      } finally {
        setLoading(false)
      }
    },
    [metadata, dataKey, selectedItem]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      setLoading(true)
      setError(null)
      try {
        await vaultClient.deleteItem(id)
        setItems((prev) => prev.filter((i) => i.id !== id))
        if (selectedItem?.id === id) setSelectedItem(null)
      } catch {
        setError("删除条目失败")
      } finally {
        setLoading(false)
      }
    },
    [selectedItem]
  )

  const clearVault = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await vaultClient.clearVault()
      setMetadata(null)
      setDataKey(null)
      setItems([])
      setSelectedItem(null)
      setStatus("setup")
    } catch {
      setError("重置保险箱失败")
    } finally {
      setLoading(false)
    }
  }, [])

  const exportBackup = useCallback(async (): Promise<string> => {
    if (!metadata) throw new Error("没有保险箱数据")
    const records = await vaultClient.listItems(metadata.id)
    const backup = await vaultCrypto.exportEncryptedBackup(metadata, records)
    return JSON.stringify(backup, null, 2)
  }, [metadata])

  const importBackup = useCallback(async (json: string): Promise<void> => {
    let backup: VaultBackup
    try {
      backup = JSON.parse(json)
    } catch {
      throw new Error("无效的备份文件格式")
    }
    if (backup.type !== "thunder-vault-backup") {
      throw new Error("不是有效的保险箱备份文件")
    }
    if (!backup.metadata || !Array.isArray(backup.items)) {
      throw new Error("备份文件结构不完整")
    }
    await vaultClient.clearVault()
    await vaultClient.saveMetadata(backup.metadata)
    for (const item of backup.items) {
      await vaultClient.saveItem(item)
    }
    setMetadata(backup.metadata)
    setDataKey(null)
    setItems([])
    setSelectedItem(null)
    setStatus("locked")
  }, [])

  const value = useMemo<VaultContextValue>(
    () => ({
      status, metadata, items, selectedItem, loading, error,
      selectItem: setSelectedItem,
      createVault, unlockVault, lockVault,
      addItem, updateItem, deleteItem, clearVault,
      exportBackup, importBackup,
    }),
    [status, metadata, items, selectedItem, loading, error,
      createVault, unlockVault, lockVault,
      addItem, updateItem, deleteItem, clearVault,
      exportBackup, importBackup]
  )

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) throw new Error("useVault must be used within VaultProvider")
  return ctx
}
