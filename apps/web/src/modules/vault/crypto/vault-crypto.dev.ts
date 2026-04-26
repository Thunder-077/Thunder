// ⚠️ 仅用于开发验证流程，不可用于生产
// 此实现不执行任何真实加密，仅用 base64 编码模拟加密流程
// 所有数据均以明文形式存储，不具备任何安全保护能力
/* eslint-disable @typescript-eslint/no-unused-vars */

import type { IVaultCrypto } from "./interface"
import type {
  VaultMetadata,
  VaultItemPlain,
  VaultItemRecord,
  VaultBackup,
  CreateVaultResult,
  UnlockVaultResult,
  EncryptedPayload,
} from "@thunder/vault"

function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

function fromBase64(b64: string): string {
  return decodeURIComponent(escape(atob(b64)))
}

function generateId(): string {
  return crypto.randomUUID()
}

export class VaultCryptoDev implements IVaultCrypto {
  async createVault(_masterPassword: string): Promise<CreateVaultResult> {
    const dataKey = `dev-data-key-${generateId()}`
    const metadata: VaultMetadata = {
      id: generateId(),
      version: 1,
      kdf: {
        algorithm: "argon2id",
        saltBase64: toBase64("dev-salt-not-secure"),
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 4,
      },
      encryptedDataKey: toBase64(dataKey),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return { metadata, dataKey }
  }

  async unlockVault(
    _masterPassword: string,
    metadata: VaultMetadata
  ): Promise<UnlockVaultResult> {
    const dataKey = fromBase64(metadata.encryptedDataKey)
    return { dataKey }
  }

  async encryptVaultItem(
    _dataKey: string,
    item: VaultItemPlain,
    vaultId: string
  ): Promise<VaultItemRecord> {
    const payload: EncryptedPayload = {
      algorithm: "aes-256-gcm",
      nonceBase64: toBase64("dev-nonce-not-secure"),
      ciphertextBase64: toBase64(JSON.stringify(item)),
    }
    return {
      id: item.id,
      vaultId,
      encryptedPayload: payload,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }
  }

  async decryptVaultItem(
    _dataKey: string,
    record: VaultItemRecord
  ): Promise<VaultItemPlain> {
    const json = fromBase64(record.encryptedPayload.ciphertextBase64)
    return JSON.parse(json) as VaultItemPlain
  }

  async changeMasterPassword(
    _oldPassword: string,
    _newPassword: string,
    metadata: VaultMetadata
  ): Promise<VaultMetadata> {
    return {
      ...metadata,
      kdf: {
        ...metadata.kdf,
        saltBase64: toBase64("dev-salt-not-secure-updated"),
      },
      updatedAt: new Date().toISOString(),
    }
  }

  async exportEncryptedBackup(
    metadata: VaultMetadata,
    items: VaultItemRecord[]
  ): Promise<VaultBackup> {
    return {
      type: "thunder-vault-backup",
      version: 1,
      metadata,
      items,
      exportedAt: new Date().toISOString(),
    }
  }

  async importEncryptedBackup(_backup: VaultBackup): Promise<void> {
    // TODO: 实现导入逻辑
  }
}
