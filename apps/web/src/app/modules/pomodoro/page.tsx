"use client"

import { useState, useEffect, useCallback } from "react"
import { Timer, Play, Pause, RotateCcw } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/empty-state"

const WORK_MINUTES = 25
const BREAK_MINUTES = 5

export default function PomodoroPage() {
  const [minutes, setMinutes] = useState(WORK_MINUTES)
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isWork, setIsWork] = useState(true)

  const tick = useCallback(() => {
    setSeconds((prev) => {
      if (prev === 0) {
        setMinutes((m) => {
          if (m === 0) {
            setIsWork((w) => !w)
            return !isWork ? WORK_MINUTES : BREAK_MINUTES
          }
          return m - 1
        })
        return 59
      }
      return prev - 1
    })
  }, [isWork])

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isRunning, tick])

  const reset = () => {
    setIsRunning(false)
    setIsWork(true)
    setMinutes(WORK_MINUTES)
    setSeconds(0)
  }

  const displayMinutes = String(minutes).padStart(2, "0")
  const displaySeconds = String(seconds).padStart(2, "0")

  return (
    <div>
      <PageHeader
        title="番茄钟"
        description="专注计时器，提升工作效率（示例模块）"
      />

      <Card className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-6 p-8">
          <div className="text-sm font-medium text-muted-foreground">
            {isWork ? "专注时间" : "休息时间"}
          </div>
          <div className="text-7xl font-bold tabular-nums tracking-tight">
            {displayMinutes}:{displaySeconds}
          </div>
          <div className="flex gap-3">
            <Button
              size="lg"
              className="gap-2"
              onClick={() => setIsRunning((r) => !r)}
            >
              {isRunning ? (
                <>
                  <Pause className="h-4 w-4" />
                  暂停
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  开始
                </>
              )}
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              重置
            </Button>
          </div>
        </CardContent>
      </Card>

      <EmptyState
        icon={<Timer className="h-6 w-6" />}
        title="番茄工作法"
        description="此模块为示例占位，暂未实现完整的历史记录和统计功能"
      />
    </div>
  )
}
