# Teleprompter Draft Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist teleprompter script content and draft text across app restarts without using a local database, using plugin storage on desktop and localStorage on Web.

**Architecture:** Introduce one small persistence adapter for the teleprompter module so the page does not care whether it is running inside the desktop plugin host or in a normal browser. The adapter loads a versioned payload once on mount, saves only when the script or draft changes, and deletes the key when both are empty. Desktop uses `thunder.storage`; Web falls back to `window.localStorage`.

**Tech Stack:** TypeScript, React hooks, Thunder plugin SDK storage bridge, browser `localStorage`, existing teleprompter page/components.

---

### Task 1: Add a teleprompter storage adapter

**Files:**
- Create: `apps/web/src/modules/teleprompter/utils/teleprompter-storage.ts`
- Modify: `apps/web/src/modules/teleprompter/components/teleprompter-page.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest"
import { buildTeleprompterStoragePayload, parseTeleprompterStoragePayload } from "./teleprompter-storage"

describe("teleprompter storage payload", () => {
  it("round-trips the persisted script and draft", () => {
    const payload = buildTeleprompterStoragePayload({
      script: "你好",
      scriptDraft: "你好，世界",
    })

    expect(parseTeleprompterStoragePayload(payload)).toEqual({
      script: "你好",
      scriptDraft: "你好，世界",
      updatedAt: expect.any(Number),
      version: 1,
    })
  })

  it("rejects malformed payloads", () => {
    expect(parseTeleprompterStoragePayload({ bad: true })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @thunder/web vitest run apps/web/src/modules/teleprompter/utils/teleprompter-storage.test.ts -t "teleprompter storage payload"`
Expected: FAIL because the storage helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type TeleprompterStoragePayload = {
  version: 1
  updatedAt: number
  script: string
  scriptDraft: string
}

export function buildTeleprompterStoragePayload(input: {
  script: string
  scriptDraft: string
}): TeleprompterStoragePayload {
  return {
    version: 1,
    updatedAt: Date.now(),
    script: input.script,
    scriptDraft: input.scriptDraft,
  }
}

export function parseTeleprompterStoragePayload(value: unknown): TeleprompterStoragePayload | null {
  if (!value || typeof value !== "object") return null
  const payload = value as Partial<TeleprompterStoragePayload>
  if (payload.version !== 1) return null
  if (typeof payload.updatedAt !== "number") return null
  if (typeof payload.script !== "string") return null
  if (typeof payload.scriptDraft !== "string") return null
  return payload as TeleprompterStoragePayload
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @thunder/web vitest run apps/web/src/modules/teleprompter/utils/teleprompter-storage.test.ts -t "teleprompter storage payload"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/modules/teleprompter/utils/teleprompter-storage.ts apps/web/src/modules/teleprompter/utils/teleprompter-storage.test.ts apps/web/src/modules/teleprompter/components/teleprompter-page.tsx
git commit -m "feat: persist teleprompter draft"
```

### Task 2: Wire persistence into desktop plugin and browser fallback

**Files:**
- Modify: `apps/web/src/modules/teleprompter/components/teleprompter-page.tsx`
- Modify: `plugins/desktop/teleprompter/plugin.json`
- Modify: `plugins/desktop/teleprompter/src/main.tsx` if needed for bootstrap verification

- [ ] **Step 1: Add the loading and saving effect**

```ts
useEffect(() => {
  let cancelled = false

  const loadPersistedScript = async () => {
    const raw = await readTeleprompterStorage()
    const payload = parseTeleprompterStoragePayload(raw)
    if (cancelled || !payload) return
    setScript((current) => (current ? current : payload.script))
    setScriptDraft((current) => (current ? current : payload.scriptDraft))
  }

  void loadPersistedScript()
  return () => {
    cancelled = true
  }
}, [])

useEffect(() => {
  const handle = window.setTimeout(() => {
    void writeTeleprompterStorage({
      script,
      scriptDraft,
    })
  }, 300)
  return () => window.clearTimeout(handle)
}, [script, scriptDraft])
```

- [ ] **Step 2: Implement desktop-first storage access with browser fallback**

```ts
async function readTeleprompterStorage(): Promise<unknown> {
  if (isTauriDesktop()) {
    try {
      return await thunder.storage.get(STORAGE_KEY)
    } catch {
      return null
    }
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : null
}

async function writeTeleprompterStorage(input: { script: string; scriptDraft: string }) {
  const hasContent = input.script.trim() || input.scriptDraft.trim()
  if (!hasContent) {
    await removeTeleprompterStorage()
    return
  }

  const payload = buildTeleprompterStoragePayload(input)
  if (isTauriDesktop()) {
    await thunder.storage.set(STORAGE_KEY, payload)
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}
```

- [ ] **Step 3: Clear storage when the script is emptied**

```ts
const replaceScript = (nextScript: string) => {
  const trimmed = nextScript.trim()
  setScript(nextScript)
  setScriptDraft(nextScript)
  setIsEditingScript(false)
  resetScriptPosition()
  if (!trimmed) {
    void removeTeleprompterStorage()
  }
}
```

- [ ] **Step 4: Verify plugin storage permission is present**

```json
{
  "permissions": ["webview", "local-api-proxy", "plugin-storage"]
}
```

- [ ] **Step 5: Run the teleprompter tests and build**

Run:
`pnpm --filter @thunder/web test:teleprompter`

Run:
`pnpm --filter @thunder/web typecheck`

Run:
`pnpm build:plugin:teleprompter`

Expected: all pass, and the rebuilt plugin can persist draft text across restarts in both Web and desktop flows.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/modules/teleprompter/components/teleprompter-page.tsx plugins/desktop/teleprompter/plugin.json plugins/desktop/teleprompter/src/main.tsx
git commit -m "feat: persist teleprompter script state"
```
