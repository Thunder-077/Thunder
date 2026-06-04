import assert from "node:assert/strict"
import { thunder } from "@thunder/plugin-sdk/browser"
import {
  buildTeleprompterStoragePayload,
  clearTeleprompterStorage,
  parseTeleprompterStoragePayload,
  readTeleprompterStorage,
  TELEPROMPTER_STORAGE_KEY,
  writeTeleprompterStorage,
} from "../src/modules/teleprompter/utils/teleprompter-storage"

type StorageRecord = Record<string, string>

function installFakeWindow(initialStorage: StorageRecord = {}) {
  const store = new Map<string, string>(Object.entries(initialStorage))
  const previousWindow = globalThis.window

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
        removeItem: (key: string) => {
          store.delete(key)
        },
      },
    },
  })

  return {
    getStore: () => store,
    restoreWindow: () => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      })
    },
  }
}

function installThunderStorageMock() {
  const originalStorage = thunder.storage
  const calls: Array<{ method: string; key: string; value?: unknown }> = []

  Object.assign(thunder, {
    storage: {
      get: async (key: string) => {
        calls.push({ method: "get", key })
        return null
      },
      set: async (key: string, value: unknown) => {
        calls.push({ method: "set", key, value })
      },
      remove: async (key: string) => {
        calls.push({ method: "remove", key })
      },
      keys: async () => [],
      clear: async () => undefined,
    },
  })

  return {
    calls,
    restore: () => {
      Object.assign(thunder, { storage: originalStorage })
    },
  }
}

async function main() {
  {
    const payload = buildTeleprompterStoragePayload({
      script: "你好",
      scriptDraft: "你好，世界",
    })

    assert.deepEqual(parseTeleprompterStoragePayload(payload), {
      version: 1,
      updatedAt: payload.updatedAt,
      script: "你好",
      scriptDraft: "你好，世界",
    })

    assert.equal(parseTeleprompterStoragePayload({ bad: true }), null)
  }

  {
    const fakeWindow = installFakeWindow()
    const storageMock = installThunderStorageMock()

    try {
      storageMock.calls.length = 0
      await writeTeleprompterStorage({
        script: "桌面稿件",
        scriptDraft: "桌面稿件草稿",
      })

      assert.equal(storageMock.calls[0]?.method, "set")
      assert.equal(storageMock.calls[0]?.key, TELEPROMPTER_STORAGE_KEY)
      assert.equal(typeof storageMock.calls[0]?.value, "object")
      assert.equal((storageMock.calls[0]?.value as { version?: number } | undefined)?.version, 1)
      assert.equal(fakeWindow.getStore().has(TELEPROMPTER_STORAGE_KEY), false)

      storageMock.calls.length = 0
      const fakePayload = buildTeleprompterStoragePayload({
        script: "桌面稿件",
        scriptDraft: "桌面稿件草稿",
      })
      Object.assign(thunder, {
        storage: {
          get: async (key: string) => {
            storageMock.calls.push({ method: "get", key })
            return fakePayload
          },
          set: async () => undefined,
          remove: async (key: string) => {
            storageMock.calls.push({ method: "remove", key })
          },
          keys: async () => [],
          clear: async () => undefined,
        },
      })

      const loaded = await readTeleprompterStorage()
      assert.deepEqual(loaded, fakePayload)

      storageMock.calls.length = 0
      await clearTeleprompterStorage()
      assert.deepEqual(storageMock.calls[0], { method: "remove", key: TELEPROMPTER_STORAGE_KEY })
    } finally {
      storageMock.restore()
      fakeWindow.restoreWindow()
    }
  }

  {
    const fallbackPayload = buildTeleprompterStoragePayload({
      script: "Web 稿件",
      scriptDraft: "Web 稿件草稿",
    })
    const fakeWindow = installFakeWindow({
      [TELEPROMPTER_STORAGE_KEY]: JSON.stringify(fallbackPayload),
    })

    Object.assign(thunder, {
      storage: {
        get: async () => null,
        set: async () => {
          throw new Error("plugin storage unavailable")
        },
        remove: async () => {
          throw new Error("plugin storage unavailable")
        },
        keys: async () => [],
        clear: async () => undefined,
      },
    })

    try {
      const loaded = await readTeleprompterStorage()
      assert.deepEqual(loaded, fallbackPayload)

      await writeTeleprompterStorage({
        script: "Web 新稿件",
        scriptDraft: "Web 新稿件草稿",
      })

      const written = fakeWindow.getStore().get(TELEPROMPTER_STORAGE_KEY)
      assert.ok(written)
      assert.deepEqual(JSON.parse(written), {
        version: 1,
        updatedAt: JSON.parse(written).updatedAt,
        script: "Web 新稿件",
        scriptDraft: "Web 新稿件草稿",
      })

      await clearTeleprompterStorage()
      assert.equal(fakeWindow.getStore().has(TELEPROMPTER_STORAGE_KEY), false)
    } finally {
      fakeWindow.restoreWindow()
    }
  }

  console.log("[teleprompter-storage] tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
