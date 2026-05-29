import { useCallback, useEffect, useRef, useState } from "react"

/** 正常动画每字间隔（毫秒） */
const NORMAL_STEP_MS = 55
/** 追赶模式每字间隔（当待动画字符较多时加速） */
const FAST_STEP_MS = 25
/** 切换到追赶模式的字符差距阈值 */
const FAST_MODE_GAP = 8

/**
 * 将跟读引擎输出的 readOffset 转换为逐字动画偏移量。
 *
 * - 前进小跳：逐字平滑推进
 * - 后退跳转：立即到位
 * - 手动校准：通过 snapKey 立即到位
 * - 非活跃状态：立即到位
 */
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

    // 显式 snap 请求 / 非活跃 / 回退跳转 → 立即到位
    if (isSnapRequest || !isActive || targetOffset < currentRef.current) {
      snapTo(targetOffset)
      return
    }

    // 前进 → 逐字动画
    if (targetOffset > currentRef.current) {
      startAnimation()
    }
  }, [targetOffset, isActive, snapKey, snapTo, startAnimation])

  // 卸载时清理动画
  useEffect(() => cancelAnimation, [cancelAnimation])

  return displayOffset
}
