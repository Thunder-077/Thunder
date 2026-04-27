"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { AppDialog, type AppDialogProps, type AppDialogType } from "@/components/app-dialog"

type DialogBaseOptions = Omit<
  AppDialogProps,
  "open" | "onOpenChange" | "onConfirm" | "closeOnConfirm" | "confirmLoading"
> & {
  title: ReactNode
}

export type DialogConfirmOptions = DialogBaseOptions
export type DialogAlertOptions = DialogBaseOptions

type DialogRequest =
  | {
      kind: "confirm"
      options: DialogConfirmOptions
      resolve: (value: boolean) => void
    }
  | {
      kind: "alert"
      options: DialogAlertOptions
      resolve: () => void
    }

interface DialogContextValue {
  confirm: (options: DialogConfirmOptions) => Promise<boolean>
  alert: (options: DialogAlertOptions) => Promise<void>
  info: (options: Omit<DialogAlertOptions, "type">) => Promise<void>
  success: (options: Omit<DialogAlertOptions, "type">) => Promise<void>
  warning: (options: Omit<DialogAlertOptions, "type">) => Promise<void>
  danger: (options: Omit<DialogAlertOptions, "type">) => Promise<void>
  error: (options: Omit<DialogAlertOptions, "type">) => Promise<void>
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

function createTypedAlert(
  alert: (options: DialogAlertOptions) => Promise<void>,
  type: AppDialogType
) {
  return (options: Omit<DialogAlertOptions, "type">) => alert({ ...options, type })
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogRequest[]>([])

  const current = queue[0]

  const closeCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  const confirm = useCallback((options: DialogConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((prev) => [...prev, { kind: "confirm", options, resolve }])
    })
  }, [])

  const alert = useCallback((options: DialogAlertOptions) => {
    return new Promise<void>((resolve) => {
      setQueue((prev) => [...prev, { kind: "alert", options, resolve }])
    })
  }, [])

  const info = useMemo(() => createTypedAlert(alert, "info"), [alert])
  const success = useMemo(() => createTypedAlert(alert, "success"), [alert])
  const warning = useMemo(() => createTypedAlert(alert, "warning"), [alert])
  const danger = useMemo(() => createTypedAlert(alert, "danger"), [alert])
  const error = useMemo(() => createTypedAlert(alert, "error"), [alert])

  const contextValue = useMemo<DialogContextValue>(
    () => ({
      confirm,
      alert,
      info,
      success,
      warning,
      danger,
      error,
    }),
    [alert, confirm, danger, error, info, success, warning]
  )

  const handleOpenChange = (open: boolean) => {
    if (open || !current) return
    if (current.kind === "confirm") {
      current.resolve(false)
    } else {
      current.resolve()
    }
    closeCurrent()
  }

  const handleConfirm = async () => {
    if (!current) return
    if (current.kind === "confirm") {
      current.resolve(true)
    } else {
      current.resolve()
    }
    closeCurrent()
  }

  const resolvedDialogProps = current
    ? {
        open: true,
        onOpenChange: handleOpenChange,
        title: current.options.title,
        description: current.options.description,
        type: current.options.type ?? "default",
        icon: current.options.icon,
        hideIcon: current.options.hideIcon,
        confirmText:
          current.options.confirmText ??
          (current.kind === "confirm" ? "确认" : current.options.type === "success" ? "知道了" : "确定"),
        cancelText: current.options.cancelText ?? "取消",
        showCancel: current.options.showCancel ?? current.kind === "confirm",
        showCloseButton: current.options.showCloseButton ?? true,
        allowEscClose: current.options.allowEscClose,
        allowOverlayClose: current.options.allowOverlayClose,
        confirmDisabled: current.options.confirmDisabled,
        cancelDisabled: current.options.cancelDisabled,
        className: current.options.className,
      }
    : null

  return (
    <DialogContext.Provider value={contextValue}>
      {children}
      {resolvedDialogProps && (
        <AppDialog
          {...resolvedDialogProps}
          onConfirm={handleConfirm}
          closeOnConfirm={false}
        />
      )}
    </DialogContext.Provider>
  )
}

export function useDialog() {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error("useDialog must be used within DialogProvider")
  }
  return context
}
