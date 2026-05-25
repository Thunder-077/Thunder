"use client"

import { useEffect, useState } from "react"
import { LoaderCircle, RefreshCw, Rocket, RotateCcw } from "lucide-react"
import { platform, type PlatformAppUpdateInfo, type PlatformRuntimeInfo } from "@thunder/platform"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

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

export function DesktopRuntimeCard() {
  const [runtimeInfo, setRuntimeInfo] = useState<PlatformRuntimeInfo | null>(null)
  const [availableUpdate, setAvailableUpdate] = useState<PlatformAppUpdateInfo | null>(null)
  const [status, setStatus] = useState("桌面更新依赖 GitHub Release 已发布版本。")
  const [isChecking, setIsChecking] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [isReadyToRestart, setIsReadyToRestart] = useState(false)

  useEffect(() => {
    let cancelled = false

    // 运行时信息只依赖平台能力，首次进入设置页时读取一次即可。
    void platform.getRuntimeInfo().then((info) => {
      if (!cancelled) {
        setRuntimeInfo(info)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleCheckForUpdate() {
    setIsChecking(true)
    setStatus("正在检查 GitHub Release 更新...")
    setIsReadyToRestart(false)

    try {
      const update = await platform.checkForAppUpdate()
      setAvailableUpdate(update)

      if (!update) {
        setStatus("当前已经是最新版本。")
        return
      }

      setStatus(`发现 ${update.version}，可直接下载并安装。`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setStatus(`检查更新失败：${message}`)
    } finally {
      setIsChecking(false)
    }
  }

  async function handleInstallUpdate() {
    setIsInstalling(true)
    setStatus("正在下载更新...")

    try {
      await platform.downloadAndInstallAppUpdate((progress) => {
        const progressText = progress.totalBytes
          ? `${formatBytes(progress.downloadedBytes)} / ${formatBytes(progress.totalBytes)}`
          : formatBytes(progress.downloadedBytes)

        setStatus(`正在下载更新：${progressText}`)
      })
      setIsReadyToRestart(true)
      setStatus("更新已安装完成，重启后生效。")
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误"
      setStatus(`安装更新失败：${message}`)
    } finally {
      setIsInstalling(false)
    }
  }

  async function handleRestart() {
    setStatus("正在重启 Thunder...")
    await platform.restartApplication()
  }

  if (!runtimeInfo || runtimeInfo.flavor !== "tauri") {
    return null
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>桌面运行时</CardTitle>
        <CardDescription>管理 Tauri 壳能力、GitHub Release 自动更新与安装状态。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">运行环境</p>
            <p className="mt-1 text-sm font-medium">{runtimeInfo.runtimeLabel}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">桌面版本</p>
            <p className="mt-1 text-sm font-medium">{runtimeInfo.appVersion ?? "未知"}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">Tauri 版本</p>
            <p className="mt-1 text-sm font-medium">{runtimeInfo.tauriVersion ?? "未知"}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/35 p-3">
            <p className="text-xs text-muted-foreground">更新源</p>
            <p className="mt-1 text-sm font-medium">GitHub Releases</p>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="flex items-center gap-2">
            <Badge variant={availableUpdate ? "default" : "secondary"}>
              {availableUpdate ? "有可用更新" : "当前最新"}
            </Badge>
            {availableUpdate && (
              <span className="text-xs text-muted-foreground">
                {availableUpdate.currentVersion} → {availableUpdate.version}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm">{status}</p>
          {availableUpdate && (
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>发布时间：{formatDate(availableUpdate.date)}</p>
              {availableUpdate.body && (
                <p className="line-clamp-4 whitespace-pre-wrap">{availableUpdate.body}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isChecking || isInstalling}
            onClick={handleCheckForUpdate}
          >
            {isChecking ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            检查更新
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!availableUpdate || isChecking || isInstalling}
            onClick={handleInstallUpdate}
          >
            {isInstalling ? <LoaderCircle className="animate-spin" /> : <Rocket />}
            下载并安装
          </Button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={!isReadyToRestart || isInstalling}
          onClick={handleRestart}
        >
          <RotateCcw />
          重启应用
        </Button>
      </CardFooter>
    </Card>
  )
}
