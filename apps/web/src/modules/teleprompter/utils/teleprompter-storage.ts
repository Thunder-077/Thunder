import {
  buildTeleprompterStoragePayload,
  clearTeleprompterStorageFallback,
  hasPersistableTeleprompterContent,
  parseTeleprompterStoragePayload,
  readTeleprompterStorageFallback,
  TELEPROMPTER_STORAGE_KEY,
  type TeleprompterStoragePayload,
  writeTeleprompterStorageFallback,
} from "@thunder/teleprompter-core"

export {
  buildTeleprompterStoragePayload,
  parseTeleprompterStoragePayload,
  TELEPROMPTER_STORAGE_KEY,
}

function hasWindowStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

export async function readTeleprompterStorage(): Promise<TeleprompterStoragePayload | null> {
  if (!hasWindowStorage()) {
    return null
  }

  return readTeleprompterStorageFallback(window.localStorage)
}

export async function writeTeleprompterStorage(input: {
  script: string
  scriptDraft: string
}): Promise<void> {
  if (!hasPersistableTeleprompterContent(input)) {
    await clearTeleprompterStorage()
    return
  }

  if (!hasWindowStorage()) {
    return
  }

  const payload = buildTeleprompterStoragePayload(input)
  writeTeleprompterStorageFallback(window.localStorage, payload)
}

export async function clearTeleprompterStorage(): Promise<void> {
  if (!hasWindowStorage()) {
    return
  }

  clearTeleprompterStorageFallback(window.localStorage)
}
