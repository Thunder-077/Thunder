"use client"

import { useEffect, useState } from "react"
import { ActivityClient, type ActivityRecord } from "@thunder/api-client"

const MODULE_LABELS: Record<string, string> = {
  vault: "密钥管家",
  emby: "Emby",
  auth: "认证",
}

const MODULE_COLORS: Record<string, string> = {
  vault: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  emby: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  auth: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
}

function getModuleLabel(module: string): string {
  if (MODULE_LABELS[module]) return MODULE_LABELS[module]
  if (module.startsWith("plugin:")) {
    const pluginId = module.slice(7)
    return pluginId.charAt(0).toUpperCase() + pluginId.slice(1)
  }
  return module
}

function getModuleColor(module: string): string {
  if (MODULE_COLORS[module]) return MODULE_COLORS[module]
  if (module.startsWith("plugin:")) {
    return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
  }
  return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300"
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "刚刚"
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString("zh-CN")
}

export function ActivityList() {
  const [activities, setActivities] = useState<ActivityRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = new ActivityClient()
    client.listActivities({ pageSize: 10 })
      .then((res) => {
        if (res.ok && res.data) {
          setActivities(res.data.items)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 animate-pulse">
            <div className="h-5 w-14 rounded-full bg-muted" />
            <div className="h-4 flex-1 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    )
  }

  if (activities.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-border/70 px-8 pb-8 pt-6 text-center surface-card">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/4 top-5 h-2.5 w-2.5 rounded-full bg-blue-200/60 dark:bg-blue-800/20" />
          <div className="absolute right-1/3 top-12 h-2 w-2 rounded-full bg-purple-200/50 dark:bg-purple-800/20" />
          <div className="absolute right-1/4 top-7 h-2 w-2 rounded-full bg-blue-200/40 dark:bg-blue-800/15" />
          <div className="absolute bottom-16 left-1/3 h-1.5 w-1.5 rounded-full bg-green-200/50 dark:bg-green-800/20" />
          <div className="absolute bottom-10 right-1/4 h-2.5 w-2.5 rounded-full bg-purple-200/40 dark:bg-purple-800/15" />
        </div>
        <div className="relative mx-auto h-24 w-32">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 160" fill="none" className="h-full w-full">
            <defs>
              <linearGradient id="cardGradient" x1="60" y1="28" x2="160" y2="132" gradientUnits="userSpaceOnUse">
                <stop stopColor="#DBEAFE" stopOpacity="0.85" />
                <stop offset="1" stopColor="#EFF6FF" stopOpacity="0.35" />
              </linearGradient>
              <linearGradient id="iconGradient" x1="82" y1="50" x2="138" y2="110" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" />
                <stop offset="1" stopColor="#2563EB" />
              </linearGradient>
              <filter id="softShadow" x="55" y="25" width="110" height="110" filterUnits="userSpaceOnUse">
                <feDropShadow dx="0" dy="14" stdDeviation="18" floodColor="#60A5FA" floodOpacity="0.16" />
              </filter>
            </defs>
            <circle cx="110" cy="80" r="48" fill="url(#cardGradient)" filter="url(#softShadow)" />
            <circle cx="70" cy="70" r="5" fill="#BFDBFE" />
            <circle cx="154" cy="64" r="6" fill="#DBEAFE" />
            <circle cx="62" cy="98" r="3" fill="#DBEAFE" />
            <circle cx="162" cy="104" r="3" fill="#BFDBFE" />
            <rect x="83" y="48" width="54" height="64" rx="14" fill="white" stroke="#DBEAFE" strokeWidth="1.5" />
            <path d="M98 68H122" stroke="url(#iconGradient)" strokeWidth="4" strokeLinecap="round" />
            <path d="M98 82H122" stroke="url(#iconGradient)" strokeWidth="4" strokeLinecap="round" opacity="0.82" />
            <path d="M98 96H115" stroke="url(#iconGradient)" strokeWidth="4" strokeLinecap="round" opacity="0.62" />
            <path d="M137 55C145 59 150 66 151 75" stroke="#BFDBFE" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 6" />
            <path d="M71 103C77 111 86 117 97 119" stroke="#DBEAFE" strokeWidth="2" strokeLinecap="round" strokeDasharray="4 6" />
          </svg>
        </div>
        <p className="relative mt-3.5 text-sm font-medium text-foreground">暂无活动记录</p>
        <p className="relative mt-1 text-xs leading-5 text-muted-foreground">开始使用模块后，这里会显示你的最近活动</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-4 py-3 surface-card">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getModuleColor(activity.module)}`}>
            {getModuleLabel(activity.module)}
          </span>
          <span className="flex-1 truncate text-sm text-foreground">{activity.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(activity.createdAt)}</span>
        </div>
      ))}
    </div>
  )
}
