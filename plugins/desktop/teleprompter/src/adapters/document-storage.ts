import { thunder } from "@thunder/plugin-sdk/browser"
import {
  buildTeleprompterStoragePayload,
  clearTeleprompterStorageFallback,
  clearTeleprompterStorageValue,
  hasPersistableTeleprompterContent,
  readTeleprompterStorageFallback,
  readTeleprompterStorageValue,
  writeTeleprompterStorageFallback,
  writeTeleprompterStorageValue,
  type TeleprompterStorageAdapter,
  type TeleprompterStoragePayload,
  type TeleprompterStorageRecord,
} from "../../../../packages/teleprompter-core/src/index"

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function createPluginStorageAdapter(): TeleprompterStorageAdapter {
  return {
    get: (key: string) => thunder.storage.get<unknown>(key),
    set: (key: string, value: unknown) => thunder.storage.set(key, value),
    remove: (key: string) => thunder.storage.remove(key),
  }
}

export async function readPluginTeleprompterDocument(): Promise<TeleprompterStoragePayload | null> {
  const fromPluginStorage = await readTeleprompterStorageValue(createPluginStorageAdapter())
  if (fromPluginStorage) {
    return fromPluginStorage
  }

  if (!hasWindowStorage()) {
    return null
  }

  return readTeleprompterStorageFallback(window.localStorage)
}

export async function writePluginTeleprompterDocument(input: TeleprompterStorageRecord): Promise<void> {
  if (!hasPersistableTeleprompterContent(input)) {
    await clearPluginTeleprompterDocument()
    return
  }

  const payload = buildTeleprompterStoragePayload(input)
  const saved = await writeTeleprompterStorageValue(createPluginStorageAdapter(), payload)
  if (saved || !hasWindowStorage()) {
    return
  }

  writeTeleprompterStorageFallback(window.localStorage, payload)
}

export async function clearPluginTeleprompterDocument(): Promise<void> {
  const cleared = await clearTeleprompterStorageValue(createPluginStorageAdapter())
  if (cleared || !hasWindowStorage()) {
    return
  }

  clearTeleprompterStorageFallback(window.localStorage)
}
