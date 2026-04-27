"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import {
  Check,
  CircleHelp,
  CircleX,
  Info,
  LoaderCircle,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AppDialogType =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "error"
  | "loading"

export interface AppDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type?: AppDialogType
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  hideIcon?: boolean
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  showCloseButton?: boolean
  onConfirm?: () => void | Promise<void>
  closeOnConfirm?: boolean
  allowEscClose?: boolean
  allowOverlayClose?: boolean
  confirmLoading?: boolean
  confirmDisabled?: boolean
  cancelDisabled?: boolean
  className?: string
}

const DEFAULT_ICON_MAP = {
  default: CircleHelp,
  info: Info,
  success: Check,
  warning: TriangleAlert,
  danger: ShieldAlert,
  error: CircleX,
  loading: LoaderCircle,
} as const

const ICON_CONTAINER_CLASS_MAP: Record<AppDialogType, string> = {
  default: "bg-muted text-muted-foreground",
  info: "bg-sky-100/80 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  success: "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  warning: "bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  danger: "bg-rose-100/80 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  error: "bg-rose-100/80 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  loading: "bg-muted text-muted-foreground",
}

const CONFIRM_BUTTON_CLASS_MAP: Record<AppDialogType, string> = {
  default: "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90",
  info: "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90",
  success: "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90",
  warning: "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90",
  danger: "bg-rose-600 text-white hover:bg-rose-600/85",
  error: "bg-rose-600 text-white hover:bg-rose-600/85",
  loading: "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/90",
}

const ESCAPE_KEY_REASON = "escape-key"

export function AppDialog({
  open,
  onOpenChange,
  type = "default",
  title,
  description,
  icon,
  hideIcon = false,
  confirmText = "确认",
  cancelText = "取消",
  showCancel = true,
  showCloseButton = true,
  onConfirm,
  closeOnConfirm = true,
  allowEscClose,
  allowOverlayClose,
  confirmLoading = false,
  confirmDisabled = false,
  cancelDisabled = false,
  className,
}: AppDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const titleId = useId()
  const descriptionId = useId()

  const shouldAllowEscClose = allowEscClose ?? (type !== "danger" && type !== "loading")
  const shouldAllowOverlayClose = allowOverlayClose ?? (type !== "danger" && type !== "loading")
  const loading = confirmLoading || submitting || type === "loading"
  const canClose = !loading
  const showIcon = !hideIcon

  const resolvedIcon = useMemo(() => {
    if (!showIcon) return null
    if (icon) return icon
    const IconComponent = DEFAULT_ICON_MAP[type]
    return (
      <IconComponent
        className={cn("h-5 w-5", type === "loading" && "animate-spin")}
        aria-hidden="true"
      />
    )
  }, [icon, showIcon, type])

  const handleConfirm = async () => {
    if (loading || confirmDisabled || !onConfirm) return
    try {
      setSubmitting(true)
      await onConfirm()
      if (closeOnConfirm) {
        onOpenChange(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleOpenChange = (nextOpen: boolean, eventDetails?: { reason?: string }) => {
    if (nextOpen) {
      onOpenChange(true)
      return
    }
    if (!canClose) return
    if (eventDetails?.reason === ESCAPE_KEY_REASON && !shouldAllowEscClose) return
    setSubmitting(false)
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      disablePointerDismissal={!shouldAllowOverlayClose}
    >
      <DialogContent
        hideClose={true}
        className={cn(
          "w-[calc(100%-2rem)] max-w-[460px] rounded-[20px] border border-border/70 bg-background p-6 text-foreground shadow-lg",
          className
        )}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        {showCloseButton && canClose && (
          <button
            type="button"
            onClick={() => {
              setSubmitting(false)
              onOpenChange(false)
            }}
            className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="关闭弹窗"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <DialogHeader className="gap-3 pr-10">
          <div className="flex items-start gap-3">
            {showIcon && (
              <div
                className={cn(
                  "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  ICON_CONTAINER_CLASS_MAP[type]
                )}
              >
                {resolvedIcon}
              </div>
            )}
            <div className="min-w-0 space-y-1.5">
              <DialogTitle id={titleId} className="text-[17px] leading-snug">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription id={descriptionId} className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
          {showCancel && (
            <Button
              variant="outline"
              onClick={() => {
                setSubmitting(false)
                onOpenChange(false)
              }}
              disabled={cancelDisabled || !canClose}
            >
              {cancelText}
            </Button>
          )}
          <Button
            onClick={handleConfirm}
            disabled={confirmDisabled || loading}
            className={cn(CONFIRM_BUTTON_CLASS_MAP[type], "min-w-[92px]")}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                处理中...
              </span>
            ) : (
              confirmText
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
