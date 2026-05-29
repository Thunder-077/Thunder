"use client"

export interface AppNotification {
  id: string
  title: string
  description: string
  type: "info" | "success" | "error" | "progress"
  timestamp: Date
  percentage?: number // 进度百分比
  downloadedText?: string // 已下载文字描述，例如 "25.4 MB"
  totalText?: string // 总大小文字描述，例如 "103 MB"
  status?: "downloading" | "completed" | "failed"
  unread: boolean
}

type Listener = (notifications: AppNotification[]) => void

class NotificationStore {
  private notifications: AppNotification[] = []
  private listeners = new Set<Listener>()

  // 从 localStorage 加载历史通知
  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("thunder_notifications")
        if (saved) {
          const parsed = JSON.parse(saved) as any[]
          this.notifications = parsed.map((n) => ({
            ...n,
            timestamp: new Date(n.timestamp),
            // 重置正在下载中的临时状态
            percentage: n.type === "progress" ? 0 : n.percentage,
            status: n.type === "progress" ? "failed" : n.status,
            description: n.type === "progress" ? "下载已中断" : n.description,
            type: n.type === "progress" ? "error" : n.type,
          }))
        }
      } catch (e) {
        console.error("加载历史通知失败", e)
      }
    }
  }

  private save() {
    if (typeof window !== "undefined") {
      try {
        const toSave = this.notifications.slice(0, 20)
        localStorage.setItem("thunder_notifications", JSON.stringify(toSave))
      } catch (e) {
        console.error("保存通知失败", e)
      }
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener)
    listener(this.notifications)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit() {
    for (const listener of this.listeners) {
      listener([...this.notifications])
    }
  }

  getNotifications() {
    return [...this.notifications]
  }

  addNotification(notification: Omit<AppNotification, "id" | "timestamp" | "unread">) {
    const id = Math.random().toString(36).substring(2, 9)
    const newNotif: AppNotification = {
      ...notification,
      id,
      timestamp: new Date(),
      unread: true,
    }
    this.notifications = [newNotif, ...this.notifications]
    this.save()
    this.emit()
    return id
  }

  addNotificationWithId(id: string, notification: Omit<AppNotification, "id" | "timestamp" | "unread">) {
    this.notifications = this.notifications.filter((n) => n.id !== id)
    
    const newNotif: AppNotification = {
      ...notification,
      id,
      timestamp: new Date(),
      unread: true,
    }
    this.notifications = [newNotif, ...this.notifications]
    this.save()
    this.emit()
  }

  updateProgress(id: string, percentage: number, downloadedBytes?: number, totalBytes?: number) {
    let formattedDownloaded = ""
    let formattedTotal = ""
    if (downloadedBytes !== undefined) {
      formattedDownloaded = (downloadedBytes / 1024 / 1024).toFixed(1) + " MB"
    }
    if (totalBytes !== undefined && totalBytes > 0) {
      formattedTotal = (totalBytes / 1024 / 1024).toFixed(1) + " MB"
    }

    this.notifications = this.notifications.map((n) => {
      if (n.id === id) {
        return {
          ...n,
          percentage,
          status: "downloading" as const,
          downloadedText: formattedDownloaded || n.downloadedText,
          totalText: formattedTotal || n.totalText,
          description: formattedTotal 
            ? `已下载 ${formattedDownloaded} / ${formattedTotal} (${percentage}%)`
            : `已下载 ${formattedDownloaded} (${percentage}%)`,
        }
      }
      return n
    })
    this.emit()
  }

  completeNotification(id: string, success: boolean, description: string) {
    this.notifications = this.notifications.map((n) => {
      if (n.id === id) {
        return {
          ...n,
          type: success ? ("success" as const) : ("error" as const),
          status: success ? ("completed" as const) : ("failed" as const),
          description,
          percentage: success ? 100 : n.percentage,
        }
      }
      return n
    })
    this.save()
    this.emit()
  }

  markAllAsRead() {
    this.notifications = this.notifications.map((n) => ({ ...n, unread: false }))
    this.save()
    this.emit()
  }

  clearNotifications() {
    this.notifications = this.notifications.filter((n) => n.type === "progress" && n.status === "downloading")
    this.save()
    this.emit()
  }

  deleteNotification(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id)
    this.save()
    this.emit()
  }

  getUnreadCount() {
    return this.notifications.filter((n) => n.unread).length
  }

  hasActiveDownloads() {
    return this.notifications.some((n) => n.type === "progress" && n.status === "downloading")
  }
}

export const notificationStore = new NotificationStore()
