import { thunder } from "@thunder/plugin-sdk/browser"

type NotificationInput = {
  type: "info" | "success" | "warning" | "error"
  title: string
  message?: string
}

type ProgressNotificationInput = {
  title: string
  description: string
  type: "progress"
  percentage: number
  status: "downloading"
}

type StoredProgressNotification = ProgressNotificationInput & {
  downloadedText?: string
  totalText?: string
}

const progressNotifications = new Map<string, StoredProgressNotification>()

function emitResultNotification(id: string, success: boolean, description: string) {
  const pending = progressNotifications.get(id)
  progressNotifications.delete(id)

  thunder.notification.add({
    type: success ? "success" : "error",
    title: pending?.title ?? "提词器",
    description,
  })
}

export const notificationStore = {
  add(notification: NotificationInput) {
    if (notification.type === "error") {
      thunder.notification.add({
        type: "error",
        title: notification.title,
        description: notification.message ?? "",
      })
      return
    }

    thunder.notification.add({
      type: notification.type === "success" ? "success" : "info",
      title: notification.title,
      description: notification.message ?? "",
    })
  },

  addNotificationWithId(id: string, notification: ProgressNotificationInput) {
    progressNotifications.set(id, notification)
  },

  updateProgress(id: string, percentage: number, downloadedBytes?: number, totalBytes?: number) {
    const pending = progressNotifications.get(id)
    if (!pending) return

    progressNotifications.set(id, {
      ...pending,
      percentage,
      downloadedText: downloadedBytes === undefined ? pending.downloadedText : `${(downloadedBytes / 1024 / 1024).toFixed(1)} MB`,
      totalText: totalBytes === undefined || totalBytes <= 0 ? pending.totalText : `${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
    })
  },

  completeNotification(id: string, success: boolean, description: string) {
    emitResultNotification(id, success, description)
  },
}
