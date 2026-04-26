export interface VaultSettings {
  autoLockMinutes: number
  hidePasswordsByDefault: boolean
  generatorLength: number
  generatorUppercase: boolean
  generatorLowercase: boolean
  generatorNumbers: boolean
  generatorSymbols: boolean
  clipboardAutoClear: boolean
  clipboardClearSeconds: number
}

export const DEFAULT_VAULT_SETTINGS: VaultSettings = {
  autoLockMinutes: 5,
  hidePasswordsByDefault: true,
  generatorLength: 16,
  generatorUppercase: true,
  generatorLowercase: true,
  generatorNumbers: true,
  generatorSymbols: true,
  clipboardAutoClear: false,
  clipboardClearSeconds: 30,
}

export const AUTO_LOCK_OPTIONS = [
  { label: "关闭", value: 0 },
  { label: "1 分钟", value: 1 },
  { label: "5 分钟", value: 5 },
  { label: "15 分钟", value: 15 },
  { label: "30 分钟", value: 30 },
]

export const CLIPBOARD_CLEAR_OPTIONS = [
  { label: "关闭", value: 0 },
  { label: "15 秒", value: 15 },
  { label: "30 秒", value: 30 },
  { label: "60 秒", value: 60 },
]
