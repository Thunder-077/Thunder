import type { VaultMetadata, VaultItemRecord } from "@thunder/vault"

export interface IVaultRepository {
  getMetadata(): Promise<VaultMetadata | null>
  saveMetadata(metadata: VaultMetadata): Promise<void>
  listItems(vaultId: string): Promise<VaultItemRecord[]>
  getItem(id: string): Promise<VaultItemRecord | null>
  saveItem(record: VaultItemRecord): Promise<void>
  deleteItem(id: string): Promise<void>
  clearVault(): Promise<void>
}
