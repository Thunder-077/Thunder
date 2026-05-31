type NotificationInput = {
  type: "info" | "success" | "warning" | "error"
  title: string
  message?: string
}

export const notificationStore = {
  add(notification: NotificationInput) {
    if (notification.type === "error") {
      console.error(`[${notification.title}] ${notification.message ?? ""}`)
      return
    }
    console.info(`[${notification.title}] ${notification.message ?? ""}`)
  },
}
