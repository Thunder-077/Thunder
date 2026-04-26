"use client"

import { useCallback, useEffect, useRef } from "react"

export function useAutoLock(
  autoLockMinutes: number,
  onLock: () => void,
  isUnlocked: boolean
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onLockRef = useRef(onLock)

  useEffect(() => {
    onLockRef.current = onLock
  }, [onLock])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (autoLockMinutes <= 0 || !isUnlocked) return
    timerRef.current = setTimeout(() => {
      onLockRef.current()
    }, autoLockMinutes * 60 * 1000)
  }, [autoLockMinutes, isUnlocked])

  useEffect(() => {
    if (autoLockMinutes <= 0 || !isUnlocked) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    resetTimer()

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll"] as const
    const handler = () => resetTimer()
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }))

    const visibilityHandler = () => {
      if (document.hidden) return
      resetTimer()
    }
    document.addEventListener("visibilitychange", visibilityHandler)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach((e) => window.removeEventListener(e, handler))
      document.removeEventListener("visibilitychange", visibilityHandler)
    }
  }, [autoLockMinutes, isUnlocked, resetTimer])
}
