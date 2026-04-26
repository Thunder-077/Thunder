import { ThunderClient } from "../client"
import type { VaultMetadata, VaultItemRecord } from "@thunder/vault"

export class VaultClient extends ThunderClient {
  async getMetadata(): Promise<VaultMetadata | null> {
    const res = await this.get<{ ok: boolean; data: { metadata: VaultMetadata | null } }>("/vault/metadata")
    return res.data.metadata
  }

  async saveMetadata(metadata: VaultMetadata): Promise<void> {
    await this.put("/vault/metadata", { metadata })
  }

  async listItems(vaultId: string): Promise<VaultItemRecord[]> {
    const res = await this.get<{ ok: boolean; data: { items: VaultItemRecord[] } }>(
      `/vault/items?vaultId=${encodeURIComponent(vaultId)}`
    )
    return res.data.items
  }

  async getItem(id: string): Promise<VaultItemRecord | null> {
    const res = await this.get<{ ok: boolean; data: { item: VaultItemRecord | null } }>(
      `/vault/items/${encodeURIComponent(id)}`
    )
    return res.data.item
  }

  async saveItem(record: VaultItemRecord): Promise<void> {
    await this.put(`/vault/items/${encodeURIComponent(record.id)}`, { record })
  }

  async deleteItem(id: string): Promise<void> {
    await this.del(`/vault/items/${encodeURIComponent(id)}`)
  }

  async clearVault(): Promise<void> {
    await this.post("/vault/clear")
  }
}
