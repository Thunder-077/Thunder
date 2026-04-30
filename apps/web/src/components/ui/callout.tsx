import { Info, CheckCircle, AlertTriangle, XCircle, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

type CalloutVariant = "info" | "success" | "warning" | "danger" | "neutral"

interface CalloutAction {
  label: string
  onClick?: () => void
  href?: string
}

interface CalloutProps {
  variant?: CalloutVariant
  title: string
  children: React.ReactNode
  icon?: React.ReactNode
  action?: CalloutAction
  className?: string
}

const variantConfig: Record<
  CalloutVariant,
  {
    bg: string
    border: string
    iconColor: string
  }
> = {
  info: {
    bg: "bg-callout-info",
    border: "border-callout-info-border",
    iconColor: "text-callout-info-icon",
  },
  success: {
    bg: "bg-callout-success",
    border: "border-callout-success-border",
    iconColor: "text-callout-success-icon",
  },
  warning: {
    bg: "bg-callout-warning",
    border: "border-callout-warning-border",
    iconColor: "text-callout-warning-icon",
  },
  danger: {
    bg: "bg-callout-danger",
    border: "border-callout-danger-border",
    iconColor: "text-callout-danger-icon",
  },
  neutral: {
    bg: "bg-callout-neutral",
    border: "border-callout-neutral-border",
    iconColor: "text-callout-neutral-icon",
  },
}

const defaultIcons: Record<CalloutVariant, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  danger: XCircle,
  neutral: Circle,
}

export function Callout({
  variant = "info",
  title,
  children,
  icon,
  action,
  className,
}: CalloutProps) {
  const config = variantConfig[variant]
  const DefaultIcon = defaultIcons[variant]

  return (
    // 去掉了原有的 space-y-2.5，把间距控制交给内部结构
    <div className={cn("rounded-xl border p-5", config.bg, config.border, className)}>
      <div className="flex items-start gap-3">
        
        {/* 1. 图标区域：去掉多余背景，增加 mt-[2px] 与文字基线对齐，加粗图标 */}
        <div className="shrink-0 mt-[2px]">
          {icon ?? <DefaultIcon className={cn("h-[22px] w-[22px]", config.iconColor)} strokeWidth={2.5} />}
        </div>

        {/* 2. 内容区域：包含标题、正文和按钮，统一个 flex-1 让它们整体右偏 */}
        <div className="min-w-0 flex-1 space-y-3">
          
          <div className="space-y-1.5">
            <p className="text-base font-bold leading-5 text-callout-foreground">{title}</p>
            <div className="text-sm leading-relaxed text-callout-muted">{children}</div>
          </div>

          {/* 3. 操作按钮：移入右侧容器，确保与文字完美左对齐 */}
          {action && (
            <div className="pt-1">
              {action.href ? (
                <a
                  href={action.href}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-lg border px-3.5 text-sm font-medium text-callout-foreground",
                    "border-callout-action-border bg-transparent transition-colors duration-150 ease-default",
                    "hover:bg-callout-action-hover"
                  )}
                >
                  {action.label}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={action.onClick}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-lg border px-3.5 text-sm font-medium text-callout-foreground",
                    "border-callout-action-border bg-transparent transition-colors duration-150 ease-default",
                    "hover:bg-callout-action-hover"
                  )}
                >
                  {action.label}
                </button>
              )}
            </div>
          )}
          
        </div>
      </div>
    </div>
  )
}