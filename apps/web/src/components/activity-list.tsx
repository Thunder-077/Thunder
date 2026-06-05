"use client"

import { useEffect, useMemo, useState } from "react"
import {
  CheckSquare,
  Film,
  Lock,
  Puzzle,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
  Package,
} from "lucide-react"
import { ActivityClient, type ActivityRecord } from "@thunder/api-client"
import { useDesktopPlugins } from "@/hooks/use-desktop-plugins"
import { useModuleRegistry } from "@/hooks/use-module-registry"

const DEFAULT_ACTIVITY_LIMIT = 5

const MODULE_META: Record<string, { label: string; icon: LucideIcon; iconClassName: string }> = {
  vault: {
    label: "密码保险箱",
    icon: Lock,
    iconClassName: "text-violet-500 bg-violet-50 dark:bg-violet-950/30",
  },
  emby: {
    label: "Emby",
    icon: Film,
    iconClassName: "text-orange-500 bg-orange-50 dark:bg-orange-950/30",
  },
  auth: {
    label: "认证中心",
    icon: ShieldCheck,
    iconClassName: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30",
  },
}

const ICON_MAP: Record<string, LucideIcon> = {
  Lock,
  Film,
  ScrollText,
  Package,
}

type ActivityStatusMeta = {
  label: string
  className: string
}

export interface ActivityListProps {
  limit?: number
}

function getActivityStatusMeta(action: string): ActivityStatusMeta {
  if (/(created|installed)$/.test(action) || action.includes("bundled-installed")) {
    return {
      label: "新增",
      className: "bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-300",
    }
  }

  if (/(updated|refreshed|upgraded)$/.test(action)) {
    return {
      label: "完成",
      className: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300",
    }
  }

  if (/(deleted|uninstalled)$/.test(action)) {
    return {
      label: "已删除",
      className: "bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300",
    }
  }

  if (/(opened|login)$/.test(action)) {
    return {
      label: "查看",
      className: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300",
    }
  }

  return {
    label: "记录",
    className: "bg-slate-100 text-slate-500 dark:bg-slate-900/60 dark:text-slate-400",
  }
}

function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  if (diffMinutes < 1) return "刚刚"
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`

  const isSameDay = now.toDateString() === date.toDateString()
  if (isSameDay) return `今天 ${time}`

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (yesterday.toDateString() === date.toDateString()) {
    return `昨天 ${time}`
  }

  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  })
}

function getActivitySubtitle(activity: ActivityRecord): string | null {
  if (activity.description?.trim()) {
    return activity.description.trim()
  }

  return null
}

export function ActivityList({ limit = DEFAULT_ACTIVITY_LIMIT }: ActivityListProps) {
  const registry = useModuleRegistry()
  const desktopPlugins = useDesktopPlugins()
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(true)

  const activityModuleMetaMap = useMemo(() => {
    const moduleEntries = registry.getEnabled().map((mod) => {
      const defaultMeta = MODULE_META[mod.id]
      return [
        mod.id,
        {
          label: mod.name,
          icon: ICON_MAP[mod.icon] ?? defaultMeta?.icon ?? Puzzle,
          iconClassName: defaultMeta?.iconClassName ?? "text-slate-500 bg-slate-100 dark:bg-slate-900/60",
        },
      ] as const
    })

    const pluginEntries = desktopPlugins.plugins.map((plugin) => [
      `plugin:${plugin.manifest.id}`,
      {
        label: plugin.manifest.name,
        icon: ICON_MAP[plugin.manifest.icon] ?? Package,
        iconClassName: "text-sky-500 bg-sky-50 dark:bg-sky-950/30",
      },
    ] as const)

    return Object.fromEntries([...moduleEntries, ...pluginEntries]) as Record<
      string,
      { label: string; icon: LucideIcon; iconClassName: string }
    >
  }, [desktopPlugins.plugins, registry])

  const getActivityModuleMeta = (module: string) => {
    if (activityModuleMetaMap[module]) {
      return activityModuleMetaMap[module]
    }

    if (module.startsWith("plugin:")) {
      return {
        label: module.slice(7),
        icon: Package,
        iconClassName: "text-sky-500 bg-sky-50 dark:bg-sky-950/30",
      }
    }

    return {
      label: module,
      icon: CheckSquare,
      iconClassName: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
    }
  }

  useEffect(() => {
    const client = new ActivityClient()

    client
      .listActivities({ pageSize: limit })
      .then((res) => {
        if (res.ok && res.data) {
          setActivities(res.data.items)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [limit])

  if (loading) {
    return (
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/90">
        {[1, 2, 3, 4, 5].slice(0, limit).map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 px-5 py-4 last:border-b-0">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-16 animate-pulse rounded bg-muted" />
            <div className="h-7 w-12 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-6 py-10 text-center">
        <p className="text-sm font-medium text-foreground">暂无最近活动</p>
        <p className="mt-1 text-sm text-muted-foreground">开始使用模块后，最近活动会显示在这里。</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-background/90 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      {activities.map((activity) => {
        const moduleMeta = getActivityModuleMeta(activity.module)
        const statusMeta = getActivityStatusMeta(activity.action)
        const subtitle = getActivitySubtitle(activity)
        const Icon = moduleMeta.icon

        return (
          <div
            key={activity.id}
            className="flex flex-col gap-3 border-b border-border/40 px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${moduleMeta.iconClassName}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {moduleMeta.label}：{activity.title}
                </p>
                {subtitle && (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-5 pl-14 sm:min-w-[220px] sm:justify-end sm:pl-0">
              <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400 sm:min-w-[88px] sm:text-right">
                {formatActivityTime(activity.createdAt)}
              </span>
              <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium sm:min-w-[60px] sm:text-center ${statusMeta.className}`}>
                {statusMeta.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
