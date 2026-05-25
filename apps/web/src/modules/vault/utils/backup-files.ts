import { platform } from "@thunder/platform"

const BACKUP_FILE_FILTERS = [
  {
    name: "Thunder Vault Backup",
    extensions: ["json"],
  },
]

export async function exportVaultBackupToFile(json: string, date: string) {
  return platform.saveTextFile({
    suggestedName: `vault-backup-${date}.json`,
    contents: json,
    filters: BACKUP_FILE_FILTERS,
  })
}

export async function importVaultBackupFromFile() {
  const selected = await platform.pickTextFile({
    filters: BACKUP_FILE_FILTERS,
  })

  return selected?.contents ?? null
}
