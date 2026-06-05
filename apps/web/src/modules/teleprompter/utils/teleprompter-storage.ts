import { thunder } from "@thunder/plugin-sdk/browser"
import {
  buildTeleprompterStoragePayload,
  clearTeleprompterStorageFallback,
  clearTeleprompterStorageValue,
  hasPersistableTeleprompterContent,
  parseTeleprompterStoragePayload,
  readTeleprompterStorageFallback,
  readTeleprompterStorageValue,
  TELEPROMPTER_STORAGE_KEY,
  type TeleprompterStoragePayload,
  type TeleprompterStorageAdapter,
  writeTeleprompterStorageFallback,
  writeTeleprompterStorageValue,
} from "@thunder/teleprompter-core"

export {
  buildTeleprompterStoragePayload,
  parseTeleprompterStoragePayload,
  TELEPROMPTER_STORAGE_KEY,
}

function createPluginStorageAdapter(): TeleprompterStorageAdapter {
  return {
    get: (key: string) => thunder.storage.get<unknown>(key),
    set: (key: string, value: unknown) => thunder.storage.set(key, value),
    remove: (key: string) => thunder.storage.remove(key),
  }
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

async function readFromPluginStorage(): Promise<TeleprompterStoragePayload | null> {
  return readTeleprompterStorageValue(createPluginStorageAdapter())
}

function readFromLocalStorage(): TeleprompterStoragePayload | null {
  if (!hasWindowStorage()) {
    return null
  }

  return readTeleprompterStorageFallback(window.localStorage)
}

export async function readTeleprompterStorage(): Promise<TeleprompterStoragePayload | null> {
  const fromPluginStorage = await readFromPluginStorage()
  if (fromPluginStorage) {
    return fromPluginStorage
  }

  return readFromLocalStorage()
}

async function writeToPluginStorage(payload: TeleprompterStoragePayload): Promise<boolean> {
  return writeTeleprompterStorageValue(createPluginStorageAdapter(), payload)
}

function writeToLocalStorage(payload: TeleprompterStoragePayload): boolean {
  if (!hasWindowStorage()) {
    return false
  }

  return writeTeleprompterStorageFallback(window.localStorage, payload)
}

export async function writeTeleprompterStorage(input: {
  script: string
  scriptDraft: string
}): Promise<void> {
  if (!hasPersistableTeleprompterContent(input)) {
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
  return clearTeleprompterStorageValue(createPluginStorageAdapter())
}

function clearLocalStorage(): boolean {
  if (!hasWindowStorage()) {
    return false
  }

  return clearTeleprompterStorageFallback(window.localStorage)
}

export async function clearTeleprompterStorage(): Promise<void> {
  const pluginStorageCleared = await clearPluginStorage()
  if (pluginStorageCleared) {
    return
  }

  clearLocalStorage()
}
