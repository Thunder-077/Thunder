import type { IVaultRepository } from "@thunder/vault"
import type { VaultMetadata, VaultItemRecord, VaultKdfParams, EncryptedPayload } from "@thunder/vault"
import { prisma } from "@thunder/database"

export class VaultRepositorySQLite implements IVaultRepository {
  async getMetadata(): Promise<VaultMetadata | null> {
    const row = await prisma.vaultMetadata.findFirst()
    if (!row) return null
    return {
      id: row.id,
      kdf: JSON.parse(row.kdfJson) as VaultKdfParams,
      encryptedDataKey: row.encryptedDataKeyJson,
      passwordHint: row.passwordHint ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async saveMetadata(metadata: VaultMetadata): Promise<void> {
    await prisma.vaultMetadata.upsert({
      where: { id: metadata.id },
      update: {
        kdfJson: JSON.stringify(metadata.kdf),
        encryptedDataKeyJson: metadata.encryptedDataKey,
        passwordHint: metadata.passwordHint ?? null,
        updatedAt: metadata.updatedAt,
      },
      create: {
        id: metadata.id,
        kdfJson: JSON.stringify(metadata.kdf),
        encryptedDataKeyJson: metadata.encryptedDataKey,
        passwordHint: metadata.passwordHint ?? null,
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      },
    })
  }

  async listItems(vaultId: string): Promise<VaultItemRecord[]> {
    const rows = await prisma.vaultItem.findMany({
      where: { vaultId },
    })
    return rows.map((row) => ({
      id: row.id,
      vaultId: row.vaultId,
      encryptedPayload: JSON.parse(row.encryptedPayloadJson) as EncryptedPayload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
  }

  async getItem(id: string): Promise<VaultItemRecord | null> {
    const row = await prisma.vaultItem.findFirst({
      where: { id },
    })
    if (!row) return null
    return {
      id: row.id,
      vaultId: row.vaultId,
      encryptedPayload: JSON.parse(row.encryptedPayloadJson) as EncryptedPayload,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }

  async saveItem(record: VaultItemRecord): Promise<void> {
    await prisma.vaultItem.upsert({
      where: { id: record.id },
      update: {
        vaultId: record.vaultId,
        encryptedPayloadJson: JSON.stringify(record.encryptedPayload),
        updatedAt: record.updatedAt,
      },
      create: {
        id: record.id,
        vaultId: record.vaultId,
        encryptedPayloadJson: JSON.stringify(record.encryptedPayload),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    })
  }

  async deleteItem(id: string): Promise<void> {
    await prisma.vaultItem.delete({
      where: { id },
    })
  }

  async clearVault(): Promise<void> {
    await prisma.vaultItem.deleteMany()
    await prisma.vaultMetadata.deleteMany()
  }
}
