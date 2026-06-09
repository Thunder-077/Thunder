import { useEffect, useMemo, useRef, useState } from "react"
import type { TeleprompterStoragePayload, TeleprompterStorageRecord } from "../../teleprompter-core/src/index"

type PersistedTeleprompterDocumentOptions = {
  snapshot: TeleprompterStorageRecord
  readDocument: () => Promise<TeleprompterStoragePayload | null>
  writeDocument: (input: TeleprompterStorageRecord) => Promise<void>
  onHydrate: (payload: TeleprompterStoragePayload) => void
  debounceMs?: number
}

type PersistedTeleprompterDocumentState = {
  hydrated: boolean
  lastSavedAt: number | null
}

/**
 * 统一封装提词稿的初始化读取和去抖保存，减少宿主和插件两侧的重复状态逻辑。
 */
export function usePersistedTeleprompterDocument({
  snapshot,
  readDocument,
  writeDocument,
  onHydrate,
  debounceMs = 300,
}: PersistedTeleprompterDocumentOptions): PersistedTeleprompterDocumentState {
  const [hydrated, setHydrated] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const snapshotKey = useMemo(() => JSON.stringify(snapshot), [snapshot])
  const saveTimerRef = useRef<number | null>(null)
  const lastSavedSnapshotRef = useRef<string | null>(null)
  const hydratedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const persisted = await readDocument()
      if (cancelled) {
        return
      }

      hydratedRef.current = true
      if (persisted) {
        lastSavedSnapshotRef.current = JSON.stringify({
          script: persisted.script,
          scriptDraft: persisted.scriptDraft,
        })
        setLastSavedAt(persisted.updatedAt)
        onHydrate(persisted)
      }

      setHydrated(true)
    })()

    return () => {
      cancelled = true
    }
  }, [onHydrate, readDocument])

  useEffect(() => {
    if (!hydratedRef.current || !hydrated) {
      return
    }

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    if (snapshotKey === lastSavedSnapshotRef.current) {
      return
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      if (snapshotKey === lastSavedSnapshotRef.current) {
        return
      }

      void writeDocument(snapshot).then(() => {
        lastSavedSnapshotRef.current = snapshotKey
        setLastSavedAt(Date.now())
      })
    }, debounceMs)

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [debounceMs, hydrated, snapshot, snapshotKey, writeDocument])

  return {
    hydrated,
    lastSavedAt,
  }
}
