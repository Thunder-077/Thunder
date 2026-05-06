"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Puzzle } from "lucide-react"
import { ModuleCard } from "@/components/module-card"
import { useModuleRegistry } from "@/hooks/use-module-registry"
import { Button } from "@/components/ui/button"
import { useAppShellFooter } from "@/components/app-shell"

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
  const [rainbowQuote, setRainbowQuote] = useState<string>("")
  const [quote, setQuote] = useState<string>("")
  const [quoteFrom, setQuoteFrom] = useState<string>("")
  const displayQuote = quote || rainbowQuote || "专注当下，效率加倍。"
  const { setFooter } = useAppShellFooter()

  const footerContent = useMemo(() => {
    if (!displayQuote && !quoteFrom) return null
    return (
      <div className="text-center">
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
    )
  }, [displayQuote, quoteFrom])

  useEffect(() => {
    setFooter(footerContent)
  }, [footerContent, setFooter])

  useEffect(() => {
    let ignore = false

    // 彩虹屁在首页标题区展示，一言只负责底部 footer。
    setRainbowQuote(getRandomQuote())

    async function fetchQuote() {
      try {
        const response = await fetch("https://v1.hitokoto.cn?c=a&c=b&c=c&c=d&c=h&encode=json")
        if (!response.ok) {
          throw new Error("API failed")
        }

        const data: HitokotoData = await response.json()
        if (ignore) return

        setQuote(data.hitokoto)
        if (data.from) {
          setQuoteFrom(data.from_who ? `${data.from} · ${data.from_who}` : data.from)
        }
      } catch {
        if (!ignore) {
          setQuote(getRandomQuote())
          setQuoteFrom("")
        }
      }
    }

    void fetchQuote()

    return () => {
      ignore = true
    }
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="mb-4 pr-0 md:pr-52">
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
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">快速访问</h2>
          <Link href="/modules">
            <Button variant="ghost" size="sm" className="gap-1 text-xs">
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
        <div className="rounded-lg border border-border p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Puzzle className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">暂无活动记录</p>
          <p className="mt-1 text-xs text-muted-foreground">开始使用模块后，这里会显示你的最近活动</p>
        </div>
      </section>
    </div>
  )
}
