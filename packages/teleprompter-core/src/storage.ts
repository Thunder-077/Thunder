export const TELEPROMPTER_STORAGE_KEY = "thunder:teleprompter:document-state"
export const TELEPROMPTER_STORAGE_VERSION = 1 as const

export type TeleprompterStoragePayload = {
  version: typeof TELEPROMPTER_STORAGE_VERSION
  updatedAt: number
  script: string
  scriptDraft: string
}

export type TeleprompterStorageRecord = {
  script: string
  scriptDraft: string
}

export type TeleprompterStorageAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  remove(key: string): Promise<void>
}

export type TeleprompterStorageFallback = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function buildTeleprompterStoragePayload(input: TeleprompterStorageRecord): TeleprompterStoragePayload {
  return {
    version: TELEPROMPTER_STORAGE_VERSION,
    updatedAt: Date.now(),
    script: input.script,
    scriptDraft: input.scriptDraft,
  }
}

export function parseTeleprompterStoragePayload(value: unknown): TeleprompterStoragePayload | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const payload = value as Partial<TeleprompterStoragePayload>
  if (payload.version !== TELEPROMPTER_STORAGE_VERSION) {
    return null
  }
  if (typeof payload.updatedAt !== "number" || !Number.isFinite(payload.updatedAt)) {
    return null
  }
  if (typeof payload.script !== "string" || typeof payload.scriptDraft !== "string") {
    return null
  }

  return {
    version: TELEPROMPTER_STORAGE_VERSION,
    updatedAt: payload.updatedAt,
    script: payload.script,
    scriptDraft: payload.scriptDraft,
  }
}

export function hasPersistableTeleprompterContent(input: TeleprompterStorageRecord) {
  return Boolean(input.script.trim() || input.scriptDraft.trim())
}

export async function readTeleprompterStorageValue(
  storage: TeleprompterStorageAdapter,
): Promise<TeleprompterStoragePayload | null> {
  try {
    const value = await storage.get(TELEPROMPTER_STORAGE_KEY)
    return parseTeleprompterStoragePayload(value)
  } catch {
    return null
  }
}

export function readTeleprompterStorageFallback(
  storage: TeleprompterStorageFallback,
): TeleprompterStoragePayload | null {
  const raw = storage.getItem(TELEPROMPTER_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return parseTeleprompterStoragePayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function writeTeleprompterStorageValue(
  storage: TeleprompterStorageAdapter,
  payload: TeleprompterStoragePayload,
): Promise<boolean> {
  try {
    await storage.set(TELEPROMPTER_STORAGE_KEY, payload)
    return true
  } catch {
    return false
  }
}

export function writeTeleprompterStorageFallback(
  storage: TeleprompterStorageFallback,
  payload: TeleprompterStoragePayload,
): boolean {
  try {
    storage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export async function clearTeleprompterStorageValue(storage: TeleprompterStorageAdapter): Promise<boolean> {
  try {
    await storage.remove(TELEPROMPTER_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function clearTeleprompterStorageFallback(storage: TeleprompterStorageFallback): boolean {
  try {
    storage.removeItem(TELEPROMPTER_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
