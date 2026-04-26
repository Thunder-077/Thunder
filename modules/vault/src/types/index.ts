export interface VaultMetadata {
  id: string
  kdf: VaultKdfParams
  encryptedDataKey: string
  passwordHint?: string | null
  createdAt: string
  updatedAt: string
}

export interface VaultKdfParams {
  algorithm: "argon2id"
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

export interface VaultTag {
  id: string
  name: string
  color: string
}

export type ExtraFieldType = "text" | "secret" | "url" | "email" | "totp" | "recovery-code" | "note"

export interface VaultExtraField {
  id: string
  name: string
  value: string
  type: ExtraFieldType
  sensitive: boolean
}

export type VaultItemType =
  | "website"
  | "secret"
  | "totp"
  | "server"
  | "database"
  | "note"

export interface VaultItemPlain {
  id: string
  title: string
  type: VaultItemType
  username: string
  password: string
  url: string
  notes: string
  tags: VaultTag[]
  favorite: boolean
  lastAccessedAt?: string | null
  createdAt: string
  updatedAt: string
  iconUrl?: string | null
  extraFields: VaultExtraField[]
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
