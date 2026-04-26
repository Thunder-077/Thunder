import type {
  VaultMetadata,
  VaultItemPlain,
  VaultItemRecord,
  VaultBackup,
  CreateVaultResult,
  UnlockVaultResult,
} from "../types"

export interface IVaultCrypto {
  createVault(masterPassword: string, passwordHint?: string): Promise<CreateVaultResult>
  unlockVault(
    masterPassword: string,
    metadata: VaultMetadata
  ): Promise<UnlockVaultResult>
  encryptVaultItem(
    dataKey: string,
    item: VaultItemPlain,
    vaultId: string
  ): Promise<VaultItemRecord>
  decryptVaultItem(
    dataKey: string,
    record: VaultItemRecord
  ): Promise<VaultItemPlain>
  changeMasterPassword(
    oldPassword: string,
    newPassword: string,
    metadata: VaultMetadata
  ): Promise<VaultMetadata>
  exportEncryptedBackup(
    metadata: VaultMetadata,
    items: VaultItemRecord[]
  ): Promise<VaultBackup>
  importEncryptedBackup(backup: VaultBackup): Promise<void>
}
