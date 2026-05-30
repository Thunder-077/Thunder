import { useEffect, useState, useCallback } from "react"
import { platform } from "@thunder/platform"
import pkg from "../../package.json"

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error"

export function useReactAppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>("idle")
  const [progress, setProgress] = useState(0)
  const [updateVersion, setUpdateVersion] = useState("")
  const [currentVersion, setCurrentVersion] = useState("")
  const [channel, setChannel] = useState<"stable" | "canary">("stable")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isTauri, setIsTauri] = useState(false)

  // 获取真实的环境与版本信息
  useEffect(() => {
    let cancelled = false
    void platform.getRuntimeInfo().then((info) => {
      if (cancelled) return
      setIsTauri(info.flavor === "tauri")
      if (info.appVersion) {
        setCurrentVersion(info.appVersion)
      } else {
        setCurrentVersion(pkg.version)
      }
      
      // 根据版本号特征检测更新通道，例如包含 alpha, beta, canary 或不是普通三段式版本号时
      const isCanary = 
        info.appVersion?.includes("canary") || 
        info.appVersion?.includes("alpha") || 
        info.appVersion?.includes("beta") ||
        pkg.version.includes("canary")
      setChannel(isCanary ? "canary" : "stable")
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 检查更新函数
  const checkForUpdate = useCallback(async () => {
    setStatus("checking")
    setErrorMessage(null)

    if (isTauri) {
      try {
        const update = await platform.checkForAppUpdate()
        if (!update) {
          setStatus("up-to-date")
          return
        }
        setUpdateVersion(update.version)
        setStatus("available")
      } catch (err) {
        setStatus("error")
        const msg = err instanceof Error ? err.message : "检查更新时发生错误"
        setErrorMessage(msg)
      }
    } else {
      // Web 浏览器端模拟
      setTimeout(() => {
        const hasUpdate = Math.random() > 0.4
        if (hasUpdate) {
          setUpdateVersion("0.3.0")
          setStatus("available")
        } else {
          setStatus("up-to-date")
        }
      }, 1000)
    }
  }, [isTauri])

  // 下载并安装更新函数
  const downloadAndInstall = useCallback(async () => {
    setStatus("downloading")
    setProgress(0)

    if (isTauri) {
      try {
        await platform.downloadAndInstallAppUpdate((progressEvent) => {
          if (progressEvent.totalBytes) {
            const currentProgress = Math.round(
              (progressEvent.downloadedBytes / progressEvent.totalBytes) * 100
            )
            setProgress(currentProgress)
          } else {
            // 兜底虚拟增量进度
            setProgress((prev) => Math.min(prev + 5, 95))
          }
        })
        setProgress(100)
        setStatus("ready")

        // 延迟 1.5s 自动重启应用以应用更新
        setTimeout(() => {
          void platform.restartApplication()
        }, 1500)
      } catch (err) {
        setStatus("error")
        const msg = err instanceof Error ? err.message : "下载或安装更新失败"
        setErrorMessage(msg)
      }
    } else {
      // Web 浏览器端模拟
      let currentProgress = 0
      const timer = setInterval(() => {
        currentProgress += 10
        setProgress(currentProgress)
        if (currentProgress >= 100) {
          clearInterval(timer)
          setStatus("ready")

          // 模拟重启与应用新版本
          setTimeout(() => {
            setCurrentVersion(updateVersion || "0.3.0")
            setStatus("up-to-date")
          }, 1500)
        }
      }, 150)
    }
  }, [isTauri, updateVersion])

  return {
    status,
    progress,
    updateVersion,
    currentVersion,
    channel,
    errorMessage,
    checkForUpdate,
    downloadAndInstall,
  }
}
