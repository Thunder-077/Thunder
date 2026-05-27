"use client"

import { useEffect, useState } from "react"
import { useTheme } from "@/components/theme-provider"
import { platform } from "@thunder/platform"
import pkg from "../../../package.json"
import styles from "./settings.module.css"

type UpdateState = "none" | "available" | "loading" | "updated"

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [isTauri, setIsTauri] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(pkg.version)
  const [targetVersion, setTargetVersion] = useState("0.2.0")
  const [updateState, setUpdateState] = useState<UpdateState>("none")
  const [isDoneChecking, setIsDoneChecking] = useState(false)

  // 获取真实的环境与版本信息
  useEffect(() => {
    let cancelled = false
    void platform.getRuntimeInfo().then((info) => {
      if (!cancelled) {
        setIsTauri(info.flavor === "tauri")
        if (info.appVersion) {
          setCurrentVersion(info.appVersion)
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  // 处理检查更新与立即更新动作（深度融合 Tauri 真实调用与网页端模拟）
  const handleUpdateAction = async () => {
    if (updateState === "available") {
      setUpdateState("loading")
      if (isTauri) {
        try {
          await platform.downloadAndInstallAppUpdate()
          setUpdateState("updated")
          setTimeout(() => {
            void platform.restartApplication()
          }, 1500)
        } catch {
          setUpdateState("none")
        }
      } else {
        // 浏览器端模拟
        setTimeout(() => {
          setCurrentVersion(targetVersion)
          setUpdateState("updated")
        }, 1200)
      }
      return
    }

    setUpdateState("loading")
    if (isTauri) {
      try {
        const update = await platform.checkForAppUpdate()
        if (!update) {
          setUpdateState("none")
          setIsDoneChecking(true)
          return
        }
        setTargetVersion(update.version)
        setUpdateState("available")
        setIsDoneChecking(true)
      } catch {
        setUpdateState("none")
        setIsDoneChecking(true)
      }
    } else {
      // 浏览器端模拟
      setTimeout(() => {
        const hasUpdate = Math.random() > 0.5
        if (hasUpdate) {
          setTargetVersion("0.2.0")
          setUpdateState("available")
        } else {
          setUpdateState("none")
        }
        setIsDoneChecking(true)
      }, 1000)
    }
  }

  return (
    <main className={styles.settingsPage}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>设置</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.title}>主题</div>

        <div className={styles.themes}>
          {/* 浅色 */}
          <div 
            className={`${styles.theme} ${theme === "light" ? styles.active : ""}`}
            onClick={() => setTheme("light")}
          >
            <div className={styles.preview}>
              <div className={styles.line}></div>
              <div className={styles.line} style={{ width: "72%" }}></div>
              <div className={styles.line} style={{ width: "38%" }}></div>
            </div>
            <div className={styles.label}>
              浅色 <span className={styles.radio}></span>
            </div>
          </div>

          {/* 深色 */}
          <div 
            className={`${styles.theme} ${theme === "dark" ? styles.active : ""}`}
            onClick={() => setTheme("dark")}
          >
            <div className={`${styles.preview} ${styles.dark}`}>
              <div className={styles.line}></div>
              <div className={styles.line} style={{ width: "72%" }}></div>
              <div className={styles.line} style={{ width: "38%" }}></div>
            </div>
            <div className={styles.label}>
              深色 <span className={styles.radio}></span>
            </div>
          </div>

          {/* 跟随系统 */}
          <div 
            className={`${styles.theme} ${theme === "system" ? styles.active : ""}`}
            onClick={() => setTheme("system")}
          >
            <div className={`${styles.preview} ${styles.system}`}>
              <div>
                <div className={styles.line}></div>
                <div className={styles.line} style={{ width: "40%" }}></div>
              </div>
              <div>
                <div className={styles.line}></div>
                <div className={styles.line} style={{ width: "40%" }}></div>
              </div>
            </div>
            <div className={styles.label}>
              跟随系统 <span className={styles.radio}></span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.title}>版本更新</div>

        <div className={styles.update}>
          <div className={styles.app}>
            <div className={styles.logoWrapper}>
              <img src="/logo.svg" alt="Thunder" className={styles.appLogo} />
            </div>
            <div>
              <div className={styles.name}>Thunder</div>
              <div className={styles.version}>v{currentVersion}</div>
            </div>
          </div>

          <div className={styles.actions}>
            {updateState === "loading" && (
              <div className={styles.status}>
                <span className={styles.spinner}></span>更新中
              </div>
            )}
            
            {updateState === "none" && (
              <div className={`${styles.status} ${styles.ok}`}>
                {isDoneChecking ? "已是最新版本" : "未检查更新"}
              </div>
            )}

            {updateState === "available" && (
              <div className={`${styles.status} ${styles.warn}`}>
                发现 v{targetVersion}
              </div>
            )}

            {updateState === "updated" && (
              <div className={`${styles.status} ${styles.ok}`}>
                已更新
              </div>
            )}

            <button 
              className={`${styles.btn} ${updateState === "available" ? styles.primary : ""}`}
              disabled={updateState === "loading"}
              onClick={handleUpdateAction}
            >
              {updateState === "available" ? "立即更新" : "检查更新"}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}
