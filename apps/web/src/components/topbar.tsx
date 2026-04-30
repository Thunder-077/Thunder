"use client"

import { useMemo } from "react"
import { usePathname } from "next/navigation"
import { Bell, Menu } from "lucide-react"
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
  "今天的咖啡格外香，因为你很棒。",
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

  if (hour < 6) {
    return "夜深了"
  }

  if (hour < 12) {
    return "上午好"
  }

  if (hour < 14) {
    return "中午好"
  }

  if (hour < 18) {
    return "下午好"
  }

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

function getDailyQuote(): string {
  const date = new Date()
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  const index = seed % rainbowQuotes.length

  return rainbowQuotes[index]
}

function NotificationButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="
    h-8 w-8 rounded-full
    text-muted-foreground/60
    transition-all duration-150
    hover:bg-muted/70 hover:text-foreground
    active:scale-95
  "
      aria-label="通知"
    >
      <Bell className="size-5" strokeWidth={2.2} />
    </Button>
  )
}

function UserAvatar() {
  return (
    <button
      type="button"
      className="
        flex h-8 w-8 items-center justify-center rounded-full
        bg-brand text-[16px] font-semibold text-primary-foreground
        shadow-sm shadow-brand/20
        transition-transform duration-150
        hover:scale-[1.04]
        active:scale-95
      "
      aria-label="用户"
    >
      U
    </button>
  )
}

function TopbarActions({ isHomePage }: { isHomePage: boolean }) {
  return (
    <div
      className={
        isHomePage
          ? "flex shrink-0 items-center gap-3 pt-1"
          : "flex shrink-0 items-center gap-3"
      }
    >
      <WeatherWidget />

      <div className="h-6 w-px bg-border" />

      <NotificationButton />

      <UserAvatar />
    </div>
  )
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const pathname = usePathname()
  const isHomePage = pathname === "/"

  const homeGreeting = useMemo(() => {
    if (!isHomePage) {
      return {
        greeting: "",
        todayDate: "",
        quote: "",
      }
    }

    return {
      greeting: getGreeting(),
      todayDate: getTodayDate(),
      quote: getDailyQuote(),
    }
  }, [isHomePage])

  return (
    <div
      className={
        isHomePage
          ? "flex items-start justify-between gap-6 py-4"
          : "flex items-center justify-between gap-3 py-3"
      }
    >
      {isHomePage ? (
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">
            {homeGreeting.todayDate}
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            {homeGreeting.greeting}，
            <br />
            <span className="text-brand">欢迎回来</span>
          </h1>

          <div className="mt-5 flex items-center gap-4">
            <span className="h-[3px] w-10 rounded-full bg-brand shrink-0" />
            <p className="text-sm text-muted-foreground">
              {homeGreeting.quote || "专注当下，效率加倍。"}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 md:hidden"
              onClick={onToggleSidebar}
              aria-label="打开导航"
            >
              <Menu className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      <TopbarActions isHomePage={isHomePage} />
    </div>
  )
}
