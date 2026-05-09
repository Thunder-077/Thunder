"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ModuleCard } from "@/components/module-card"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { Button } from "@/components/ui/button"

const rainbowQuotes = [
  "专注当下，效率加倍。",
  "今天的你，比昨天更强大。",
  "保持热爱，奔赴山海。",
  "每一个小进步，都是大胜利。",
  "你的努力，时光都看得见。",
  "相信自己，你比想象中更优秀。",
  "新的一天，新的可能。",
  "慢慢来，好戏都在烟火里。",
  "星光不问赶路人，时光不负有心人。",
  "愿你眼中有光，心中有爱。",
  "今天的咖啡格外香，因为你很棒的。",
  "万事开头难，但你已经开始了。",
  "你的坚持，终将美好。",
  "生活明朗，万物可爱。",
  "做最好的自己，其他的交给时间。",
]

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 12) return "早上好"
  if (hour < 14) return "中午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

function getTodayDate(): string {
  const date = new Date()
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = weekdays[date.getDay()]
  return `${year}年${month}月${day}日 星期${weekday}`
}

function getRandomQuote(): string {
  const index = Math.floor(Math.random() * rainbowQuotes.length)
  return rainbowQuotes[index]
}

export default function DashboardPage() {
  const registry = useModuleRegistry()
  const modules = registry.getEnabled()
  const [rainbowQuote, setRainbowQuote] = useState<string>("")

  useEffect(() => {
    setRainbowQuote(getRandomQuote())
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="relative mb-4 pr-0 md:pr-52 bg-transparent">
        <div className="pointer-events-none absolute inset-x-0 -top-14 -z-10 h-[320px] overflow-hidden">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 1600 360"
            preserveAspectRatio="none"
            fill="none"
            className="h-full w-full"
          >
            <defs>
              <radialGradient id="sunGlow" cx="45%" cy="13%" r="38%">
                <stop offset="0%" stopColor="#FDE68A" stopOpacity={0.22} />
                <stop offset="45%" stopColor="#FEF3C7" stopOpacity={0.10} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
              </radialGradient>

              <linearGradient id="mountainFar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#EFF6FF" stopOpacity={0.06} />
                <stop offset="45%" stopColor="#DBEAFE" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#EFF6FF" stopOpacity={0.06} />
              </linearGradient>

              <linearGradient id="mountainMid" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#DBEAFE" stopOpacity={0.10} />
                <stop offset="48%" stopColor="#BFDBFE" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#E0F2FE" stopOpacity={0.10} />
              </linearGradient>

              <linearGradient id="mountainNear" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#BFDBFE" stopOpacity={0.10} />
                <stop offset="55%" stopColor="#93C5FD" stopOpacity={0.16} />
                <stop offset="100%" stopColor="#DBEAFE" stopOpacity={0.08} />
              </linearGradient>

              <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0} />
                <stop offset="78%" stopColor="#FFFFFF" stopOpacity={0.10} />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.72} />
              </linearGradient>
            </defs>

            <rect width="1600" height="360" fill="url(#sunGlow)" />

            <path
              d="M0 208
       C95 190 165 202 250 178
       C350 150 430 188 520 160
       C635 124 720 180 825 145
       C955 102 1065 166 1175 128
       C1305 82 1405 150 1600 116
       L1600 360 L0 360 Z"
              fill="url(#mountainFar)"
            />

            <path
              d="M0 238
       C120 212 220 230 330 194
       C455 154 560 214 675 174
       C805 128 930 212 1050 164
       C1185 110 1315 214 1425 176
       C1505 148 1555 150 1600 158
       L1600 360 L0 360 Z"
              fill="url(#mountainMid)"
            />

            <path
              d="M0 268
       C145 240 270 258 410 226
       C560 192 680 274 830 232
       C990 188 1125 270 1280 234
       C1410 204 1515 232 1600 224
       L1600 360 L0 360 Z"
              fill="url(#mountainNear)"
            />

            <rect width="1600" height="360" fill="url(#fadeBottom)" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">
          {getTodayDate()}
        </p>
        <div className="mt-2 space-y-0">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {getGreeting()}，
          </h1>
          <p className="text-3xl font-semibold tracking-tight text-brand sm:text-4xl">
            欢迎回来
          </p>
        </div>
        <div className="mt-5 flex items-center gap-4">
          <span className="h-[3px] w-10 rounded-full bg-brand shrink-0" />
          <p className="text-sm text-muted-foreground">
            {rainbowQuote || "专注当下，效率加倍。"}
          </p>
        </div>
      </section>

      {/* 快速访问 */}
      <section className="mb-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">快速访问</h2>
          <Link href="/modules">
            <Button variant="ghost" size="sm" className="gap-1 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
              查看全部
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => (
            <Link key={mod.id} href={mod.route}>
              <ModuleCard module={mod} />
            </Link>
          ))}
        </div>
      </section>

      {/* 最近活动 */}
      <section className="min-h-0 flex-1">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">最近活动</h2>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 px-8 pb-8 pt-6 text-center surface-card">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-1/4 top-5 h-2.5 w-2.5 rounded-full bg-blue-200/60 dark:bg-blue-800/20" />
            <div className="absolute right-1/3 top-12 h-2 w-2 rounded-full bg-purple-200/50 dark:bg-purple-800/20" />
            <div className="absolute right-1/4 top-7 h-2 w-2 rounded-full bg-blue-200/40 dark:bg-blue-800/15" />
            <div className="absolute bottom-16 left-1/3 h-1.5 w-1.5 rounded-full bg-green-200/50 dark:bg-green-800/20" />
            <div className="absolute bottom-10 right-1/4 h-2.5 w-2.5 rounded-full bg-purple-200/40 dark:bg-purple-800/15" />
          </div>
          <div className="relative mx-auto h-24 w-32">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 220 160"
              fill="none"
              className="h-full w-full"
            >
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

              <rect
                x="83"
                y="48"
                width="54"
                height="64"
                rx="14"
                fill="white"
                stroke="#DBEAFE"
                strokeWidth="1.5"
              />

              <path
                d="M98 68H122"
                stroke="url(#iconGradient)"
                strokeWidth="4"
                strokeLinecap="round"
              />

              <path
                d="M98 82H122"
                stroke="url(#iconGradient)"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.82"
              />

              <path
                d="M98 96H115"
                stroke="url(#iconGradient)"
                strokeWidth="4"
                strokeLinecap="round"
                opacity="0.62"
              />

              <path
                d="M137 55C145 59 150 66 151 75"
                stroke="#BFDBFE"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="4 6"
              />

              <path
                d="M71 103C77 111 86 117 97 119"
                stroke="#DBEAFE"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="4 6"
              />
            </svg>
          </div>
          <p className="relative mt-3.5 text-sm font-medium text-foreground">暂无活动记录</p>
          <p className="relative mt-1 text-xs leading-5 text-muted-foreground">开始使用模块后，这里会显示你的最近活动</p>
        </div>
      </section>
    </div>
  )
}
