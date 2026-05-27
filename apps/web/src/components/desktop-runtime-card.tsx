"use client"

import { useEffect, useState } from "react"
import { LoaderCircle, RefreshCw, Rocket, RotateCcw } from "lucide-react"
import { platform, type PlatformAppUpdateInfo, type PlatformRuntimeInfo } from "@thunder/platform"
import { Button } from "@/components/ui/button"

function formatDate(value: string | null) {
  if (!value) {
    return "未提供"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error"

export function DesktopRuntimeCard() {
  const [runtimeInfo, setRuntimeInfo] = useState<PlatformRuntimeInfo | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<PlatformAppUpdateInfo | null>(null)
  const [phase, setPhase] = useState<UpdatePhase>("idle")
  const [statusMessage, setStatusMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    void platform.getRuntimeInfo().then((info) => {
      if (!cancelled) {
        setRuntimeInfo(info)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleAction() {
    if (phase === "idle" || phase === "up-to-date" || phase === "error") {
      setPhase("checking")
      setStatusMessage("正在检查更新...")
      setAvailableUpdate(null)

      try {
        const update = await platform.checkForAppUpdate()
        setAvailableUpdate(update)

        if (!update) {
          setPhase("up-to-date")
          setStatusMessage("当前已是最新版本")
          return
        }

        setPhase("available")
        setStatusMessage(`${update.currentVersion} → ${update.version}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        setPhase("error")
        setStatusMessage(`检查失败：${message}`)
      }
    } else if (phase === "available") {
      setPhase("downloading")
      setStatusMessage("正在下载更新...")

      try {
        await platform.downloadAndInstallAppUpdate((progress) => {
          const progressText = progress.totalBytes
            ? `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`
            : formatBytes(progress.downloadedBytes)

          setStatusMessage(`正在下载：${progressText}`)
        })
        setPhase("ready")
        setStatusMessage("更新已就绪，重启后生效")
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        setPhase("error")
        setStatusMessage(`安装失败：${message}`)
      }
    } else if (phase === "ready") {
      setStatusMessage("正在重启 Thunder...")
      await platform.restartApplication()
    }
  }

  if (!runtimeInfo || runtimeInfo.flavor !== "tauri") {
    return null
  }

  const isBusy = phase === "checking" || phase === "downloading"

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/35 p-4">
      {availableUpdate && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>发布时间：{formatDate(availableUpdate.date)}</p>
          {availableUpdate.body && (
            <p className="line-clamp-4 whitespace-pre-wrap">{availableUpdate.body}</p>
          )}
        </div>
      )}

      {statusMessage && <p className="text-sm">{statusMessage}</p>}

      <Button
        variant={phase === "available" || phase === "ready" ? "primary" : "outline"}
        size="sm"
        disabled={isBusy}
        onClick={handleAction}
      >
        {phase === "checking" ? (
          <><LoaderCircle className="animate-spin" /> 检查更新</>
        ) : phase === "downloading" ? (
          <><LoaderCircle className="animate-spin" /> 下载中</>
        ) : phase === "available" ? (
          <><Rocket /> 下载并安装</>
        ) : phase === "ready" ? (
          <><RotateCcw /> 重启应用</>
        ) : (
          <><RefreshCw /> 检查更新</>
        )}
      </Button>
    </div>
  )
}
