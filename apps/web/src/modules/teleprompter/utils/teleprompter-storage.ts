import { thunder } from "@thunder/plugin-sdk/browser"

export const TELEPROMPTER_STORAGE_KEY = "thunder:teleprompter:document-state"
export const TELEPROMPTER_STORAGE_VERSION = 1 as const

export type TeleprompterStoragePayload = {
  version: typeof TELEPROMPTER_STORAGE_VERSION
  updatedAt: number
  script: string
  scriptDraft: string
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export function buildTeleprompterStoragePayload(input: {
  script: string
  scriptDraft: string
}): TeleprompterStoragePayload {
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

function hasPersistableContent(input: { script: string; scriptDraft: string }) {
  return Boolean(input.script.trim() || input.scriptDraft.trim())
}

async function readFromPluginStorage(): Promise<TeleprompterStoragePayload | null> {
  try {
    const value = await thunder.storage.get<unknown>(TELEPROMPTER_STORAGE_KEY)
    return parseTeleprompterStoragePayload(value)
  } catch {
    return null
  }
}

function readFromLocalStorage(): TeleprompterStoragePayload | null {
  if (!hasWindowStorage()) {
    return null
  }

  const raw = window.localStorage.getItem(TELEPROMPTER_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return parseTeleprompterStoragePayload(JSON.parse(raw))
  } catch {
    return null
  }
}

export async function readTeleprompterStorage(): Promise<TeleprompterStoragePayload | null> {
  const fromPluginStorage = await readFromPluginStorage()
  if (fromPluginStorage) {
    return fromPluginStorage
  }

  return readFromLocalStorage()
}

async function writeToPluginStorage(payload: TeleprompterStoragePayload): Promise<boolean> {
  try {
    await thunder.storage.set(TELEPROMPTER_STORAGE_KEY, payload)
    return true
  } catch {
    return false
  }
}

function writeToLocalStorage(payload: TeleprompterStoragePayload): boolean {
  if (!hasWindowStorage()) {
    return false
  }

  try {
    window.localStorage.setItem(TELEPROMPTER_STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export async function writeTeleprompterStorage(input: {
  script: string
  scriptDraft: string
}): Promise<void> {
  if (!hasPersistableContent(input)) {
    await clearTeleprompterStorage()
    return
  }

  const payload = buildTeleprompterStoragePayload(input)
  const pluginStorageSaved = await writeToPluginStorage(payload)
  if (pluginStorageSaved) {
    return
  }

  writeToLocalStorage(payload)
}

async function clearPluginStorage(): Promise<boolean> {
  try {
    await thunder.storage.remove(TELEPROMPTER_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

function clearLocalStorage(): boolean {
  if (!hasWindowStorage()) {
    return false
  }

  try {
    window.localStorage.removeItem(TELEPROMPTER_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export async function clearTeleprompterStorage(): Promise<void> {
  const pluginStorageCleared = await clearPluginStorage()
  if (pluginStorageCleared) {
    return
  }

  clearLocalStorage()
}
