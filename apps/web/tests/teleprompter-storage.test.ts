import assert from "node:assert/strict"
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
    const fallbackPayload = buildTeleprompterStoragePayload({
      script: "Web 稿件",
      scriptDraft: "Web 稿件草稿",
    })
    const fakeWindow = installFakeWindow({
      [TELEPROMPTER_STORAGE_KEY]: JSON.stringify(fallbackPayload),
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
