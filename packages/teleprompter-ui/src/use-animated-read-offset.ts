import { useCallback, useEffect, useRef, useState } from "react"

const NORMAL_STEP_MS = 55
const FAST_STEP_MS = 25
const FAST_MODE_GAP = 8

export function useAnimatedReadOffset(
  targetOffset: number,
  isActive: boolean,
  snapKey = 0,
): number {
  const [displayOffset, setDisplayOffset] = useState(0)
  const currentRef = useRef(0)
  const targetRef = useRef(0)
  const isActiveRef = useRef(isActive)
  const rafRef = useRef<number | null>(null)
  const lastStepTimeRef = useRef(0)
  const prevSnapKeyRef = useRef(snapKey)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastStepTimeRef.current = 0
  }, [])

  const snapTo = useCallback((offset: number) => {
    cancelAnimation()
    currentRef.current = offset
    targetRef.current = offset
    setDisplayOffset(offset)
  }, [cancelAnimation])

  const startAnimation = useCallback(() => {
    if (rafRef.current !== null) return

    const step = (timestamp: number) => {
      if (!isActiveRef.current) {
        rafRef.current = null
        lastStepTimeRef.current = 0
        return
      }

      const current = currentRef.current
      const target = targetRef.current
      if (current >= target) {
        rafRef.current = null
        lastStepTimeRef.current = 0
        return
      }

      if (lastStepTimeRef.current === 0) {
        lastStepTimeRef.current = timestamp
      }

      const gap = target - current
      const stepMs = gap > FAST_MODE_GAP ? FAST_STEP_MS : NORMAL_STEP_MS
      const elapsed = timestamp - lastStepTimeRef.current

      if (elapsed >= stepMs) {
        const next = current + 1
        currentRef.current = next
        setDisplayOffset(next)
        lastStepTimeRef.current = timestamp
      }

      if (currentRef.current < targetRef.current) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        lastStepTimeRef.current = 0
      }
    }

    rafRef.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => {
    const isSnapRequest = prevSnapKeyRef.current !== snapKey
    prevSnapKeyRef.current = snapKey

    targetRef.current = targetOffset
    if (isSnapRequest || !isActive || targetOffset < currentRef.current) {
      snapTo(targetOffset)
      return
    }

    if (targetOffset > currentRef.current) {
      startAnimation()
    }
  }, [isActive, snapKey, snapTo, startAnimation, targetOffset])

  useEffect(() => cancelAnimation, [cancelAnimation])

  return displayOffset
}
