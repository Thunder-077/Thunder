import { useReactAppUpdater, UpdateStatus } from "@/hooks/use-react-app-updater"
import { RefreshCw, Laptop, CheckCircle2, ArrowUpCircle, ArrowDownToLine, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import styles from "../settings.module.css"

export default function UpdatePanel({
  overrideStatus,
  overrideProgress,
}: {
  overrideStatus?: UpdateStatus
  overrideProgress?: number
}) {
  const realUpdater = useReactAppUpdater()

  const status = overrideStatus ?? realUpdater.status
  const progress = overrideProgress ?? realUpdater.progress
  const currentVersion = realUpdater.currentVersion
  const updateVersion = overrideStatus ? "0.3.0" : realUpdater.updateVersion
  const channel = realUpdater.channel
  const errorMessage = overrideStatus === "error"
    ? "无法连接到更新服务器，网络连接超时。"
    : realUpdater.errorMessage

  const checkForUpdate = realUpdater.checkForUpdate
  const downloadAndInstall = realUpdater.downloadAndInstall

  const isChecking = status === "checking"
  const isHighlightState = ["available", "downloading", "ready"].includes(status)
  const channelLabel = channel === "canary" ? "Canary" : "Stable"

  if (status === "up-to-date") {
    return (
      <Card size="sm" className={`rounded-lg ${styles.updateCardSuccess}`}>
        <CardContent>
          <div className={styles.cardInner}>
            <div className={styles.cardLeft}>
              <div className={`${styles.iconBox} ${styles.iconSuccess}`}>
                <CheckCircle2 size={20} />
              </div>
              <div className={styles.textContent}>
                <h2 className={styles.mainTitle}>当前已是最新版本</h2>
                <p className={styles.subText}>
                  当前版本 <span className={styles.versionTag}>v{currentVersion}</span> · {channelLabel}
                </p>
              </div>
            </div>
            <div className={styles.cardRight}>
              <Button
                variant="outline"
                onClick={checkForUpdate}
                disabled={isChecking}
                className="rounded-lg"
              >
                <RefreshCw size={14} className={isChecking ? styles.rotating : ""} />
                {isChecking ? "正在检查..." : "再次检查"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isHighlightState) {
    return (
      <Card size="sm" className={`rounded-lg ${styles.updateCardHighlight}`}>
        <CardContent>
          <div className={styles.cardInner}>
            <div className={styles.cardLeft}>
              <div className={`${styles.iconBox} ${styles.iconHighlight}`}>
                {status === "downloading" ? <ArrowDownToLine size={20} /> : <ArrowUpCircle size={20} />}
              </div>
              <div className={styles.textContent}>
                <h2 className={styles.mainTitle}>
                  {status === "available"
                    ? "发现全新版本！"
                    : status === "downloading"
                    ? "正在下载更新..."
                    : "更新已准备就绪！"}
                  <span className={`${styles.versionTag} ${styles.newVersionTag}`}>
                    v{updateVersion}
                  </span>
                </h2>
                {status === "available" ? (
                  <p className={styles.subText}>
                    当前版本 <span className={`${styles.versionTag} ${styles.oldVersion}`}>v{currentVersion}</span>
                  </p>
                ) : status === "downloading" ? null : (
                  <p className={styles.subText}>
                    新版本已准备就绪，即将自动重启应用
                  </p>
                )}
              </div>
            </div>
            <div className={styles.cardRight}>
              {status === "available" ? (
                <Button
                  variant="primary"
                  onClick={downloadAndInstall}
                  className="rounded-lg"
                >
                  <ArrowDownToLine size={14} />
                  立即更新
                </Button>
              ) : status === "downloading" ? (
                <Button variant="secondary" disabled className={`${styles.btnDownloading} rounded-lg`}>
                  <span className={styles.btnProgressFill} style={{ width: `${progress}%` }} />
                  <span className={styles.btnProgressContent}>
                    <RefreshCw size={14} className={styles.rotating} />
                    下载中 {progress}%
                  </span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  className={`${styles.btnRelaunch} rounded-lg`}
                >
                  <RefreshCw size={14} className={styles.rotating} />
                  正在重启...
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const isError = status === "error"

  return (
    <Card size="sm" className={`rounded-lg ${isError ? styles.updateCardError : ""}`}>
      <CardContent>
        <div className={styles.cardInner}>
          <div className={styles.cardLeft}>
            <div className={`${styles.iconBox} ${isError ? styles.iconError : styles.iconDefault}`}>
              {isError ? <AlertTriangle size={20} /> : <Laptop size={20} />}
            </div>
            <div className={styles.textContent}>
              <h2 className={styles.mainTitle}>系统版本与更新</h2>
              <p className={styles.subText}>
                当前版本 <span className={styles.versionTag}>v{currentVersion || "加载中..."}</span> · {channelLabel}
                {status === "error" ? (
                  <span className={styles.errorBadge} title={errorMessage ?? ""}>
                    (检查失败)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className={styles.cardRight}>
            <Button
              variant="primary"
              onClick={checkForUpdate}
              disabled={isChecking}
              className="rounded-lg"
            >
              <RefreshCw size={14} className={isChecking ? styles.rotating : ""} />
              {isChecking ? "正在检查..." : "检查更新"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
export type { UpdateStatus }
