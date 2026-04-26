export interface VaultMetadata {
  id: string
  version: number
  kdf: VaultKdfParams
  encryptedDataKey: string
  createdAt: string
  updatedAt: string
}

export interface VaultKdfParams {
  algorithm: "argon2id" | "pbkdf2"
  saltBase64: string
  memoryKiB: number
  iterations: number
  parallelism: number
}

export interface EncryptedPayload {
  algorithm: "aes-256-gcm"
  nonceBase64: string
  ciphertextBase64: string
}

export interface VaultItemPlain {
  id: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export interface VaultItemRecord {
  id: string
  vaultId: string
  encryptedPayload: EncryptedPayload
  createdAt: string
  updatedAt: string
}

export interface VaultSession {
  vaultId: string
  unlocked: boolean
  unlockedAt: string | null
}

export interface VaultBackup {
  type: "thunder-vault-backup"
  version: number
  metadata: VaultMetadata
  items: VaultItemRecord[]
  exportedAt: string
}

export interface CreateVaultResult {
  metadata: VaultMetadata
  dataKey: string
}

export interface UnlockVaultResult {
  dataKey: string
}
