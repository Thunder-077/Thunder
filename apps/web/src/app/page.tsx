"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Puzzle } from "lucide-react"
import { ModuleCard } from "@/components/module-card"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { Button } from "@/components/ui/button"

// 彩虹屁语录库
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

interface HitokotoData {
  hitokoto: string
  from?: string
  from_who?: string | null
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

export default function DashboardPage() {
  const registry = useModuleRegistry()
  const modules = registry.getEnabled()
  const [quote, setQuote] = useState<string>("")
  const [quoteFrom, setQuoteFrom] = useState<string>("")
  const [rainbowQuote, setRainbowQuote] = useState<string>("")
  const displayQuote = quote || rainbowQuote || "专注当下，效率加倍。"

  useEffect(() => {
    const rainbowQuoteTimer = window.setTimeout(() => {
      setRainbowQuote(getRandomQuote())
    }, 0)

    const fetchQuote = async () => {
      try {
        const response = await fetch('https://v1.hitokoto.cn?c=a&c=b&c=c&c=d&c=h&encode=json')
        if (!response.ok) throw new Error('API failed')
        const data: HitokotoData = await response.json()
        setQuote(data.hitokoto)
        if (data.from) {
          setQuoteFrom(data.from_who ? `${data.from} · ${data.from_who}` : data.from)
        }
      } catch {
        setQuote(getRandomQuote())
      }
    }

    fetchQuote()

    return () => {
      window.clearTimeout(rainbowQuoteTimer)
    }
  }, [])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 顶部大标题区域 */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{getTodayDate()}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {getGreeting()}，
              <br />
              <span className="text-brand">欢迎回来</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {rainbowQuote || "专注当下，效率加倍。"}
            </p>
          </div>

          {/* 右侧概览卡片 */}
          <div className="hidden shrink-0 rounded-2xl border border-border bg-card p-5 sm:block sm:w-[260px]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">模块概览</h3>
              <Link href="/modules">
                <Button variant="ghost" size="sm" className="h-auto gap-1 px-0 py-0 text-xs text-brand hover:text-brand">
                  查看全部
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight">{modules.length}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">已启用模块</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tracking-tight">{registry.getEnabled().filter(m => m.category === "productivity").length}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">效率工具</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 快速访问 */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">快速访问</h2>
          <Link href="/modules">
            <Button variant="ghost" size="sm" className="text-xs gap-1">
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
      <section className="flex-1 min-h-0">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">最近活动</h2>
        <div className="rounded-lg border border-border p-8 text-center">
          <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Puzzle className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">暂无活动记录</p>
          <p className="mt-1 text-xs text-muted-foreground">开始使用模块后，这里会显示你的最近活动</p>
        </div>
      </section>

      {/* 底部一言语录 */}
      {(displayQuote || quoteFrom) && (
        <div className="sticky bottom-0 bg-background pt-6 pb-4 text-center">
          <div className="group relative mx-auto w-fit">
            <p className="text-sm text-muted-foreground/70 transition-colors duration-200 group-hover:text-muted-foreground">
              {`「 ${displayQuote} 」`}
            </p>
            {quoteFrom && (
              <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 translate-y-1 whitespace-nowrap text-xs text-muted-foreground/0 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:text-muted-foreground/60 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:text-muted-foreground/60 group-focus-within:opacity-100">
                -{quoteFrom}-
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
