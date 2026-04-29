"use client"

import { useState, useEffect } from "react"
import { Menu, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WeatherWidget } from "@/components/weather-widget"

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

interface TopbarProps {
  onToggleSidebar?: () => void
}

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

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const [greeting, setGreeting] = useState("")
  const [todayDate, setTodayDate] = useState("")
  const [quote, setQuote] = useState("")

  useEffect(() => {
    setGreeting(getGreeting())
    setTodayDate(getTodayDate())
    setQuote(getRandomQuote())
  }, [])

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted-foreground">{todayDate}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {greeting}，
          <br />
          <span className="text-brand">欢迎回来</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">{quote || "专注当下，效率加倍。"}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-1">
        <WeatherWidget />
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="通知">
          <Bell className="h-[16px] w-[16px]" />
        </Button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-primary-foreground shadow-xs hover:opacity-90 transition-opacity"
          aria-label="用户"
        >
          U
        </button>
      </div>
    </div>
  )
}
