"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { AppSidebar } from "@/components/sidebar"
import { UtilityCluster } from "@/components/utility-cluster"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useDesktopTitlebar } from "@/hooks/use-desktop-titlebar"

type AppShellContextValue = {
  hasPageHeader: boolean
  setHasPageHeader: (value: boolean) => void
  onToggleSidebar: () => void
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

export function useAppShellFooter() {
  const ctx = useContext(AppShellContext)
  if (!ctx) {
    throw new Error("useAppShellFooter must be used within <AppShell>")
  }
  return ctx
}

// --- 一言语录 ---

interface HitokotoData {
  hitokoto: string
  from?: string
  from_who?: string | null
}

const fallbackQuotes = [
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

const DEFAULT_QUOTE = "星光不问赶路人，时光不负有心人。"

function getRandomFallbackQuote(): string {
  return fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)]
}

function useHitokoto() {
  const [quote, setQuote] = useState(DEFAULT_QUOTE)
  const [quoteFrom, setQuoteFrom] = useState("")

  useEffect(() => {
    let ignore = false

    async function fetchQuote() {
      try {
        const response = await fetch("https://v1.hitokoto.cn?c=a&c=b&c=c&c=d&c=h&encode=json")
        if (!response.ok) throw new Error("API failed")

        const data: HitokotoData = await response.json()
        if (ignore) return

        setQuote(data.hitokoto)
        if (data.from) {
          setQuoteFrom(data.from_who ? `${data.from} · ${data.from_who}` : data.from)
        }
      } catch {
        if (!ignore) {
          setQuote(getRandomFallbackQuote())
          setQuoteFrom("")
        }
      }
    }

    void fetchQuote()

    return () => {
      ignore = true
    }
  }, [])

  return { quote: quote || getRandomFallbackQuote(), quoteFrom }
}

function HitokotoFooter() {
  const { quote, quoteFrom } = useHitokoto()

  return (
    <div className="shrink-0 px-4 pb-3 pt-1 sm:px-6 xl:px-8">
      <div className="mx-auto w-full max-w-[1280px]">
        <div className="text-center">
          <p className="group inline text-sm text-muted-foreground/70 transition-colors duration-200 hover:text-muted-foreground">
            {`「 ${quote} 」`}
            {quoteFrom && (
              <span className="ml-1.5 text-xs text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/50">
                —{quoteFrom}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

// --- AppShell ---

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [hasPageHeader, setHasPageHeader] = useState(false)

  useDesktopTitlebar()

  if (pathname === "/login") {
    return (
      <div className="relative flex h-screen flex-col overflow-hidden bg-background">
        <div data-tauri-drag-region className="desktop-titlebar" />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    )
  }

  return (
    <AppShellContext.Provider
      value={{
        hasPageHeader,
        setHasPageHeader,
        onToggleSidebar: () => setMobileSidebarOpen(true),
      }}
    >
      <div className="surface-shell relative flex h-screen flex-col overflow-hidden bg-background">
        <div data-tauri-drag-region className="desktop-titlebar" />
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AppSidebar
            className={cn(
              "hidden shrink-0 md:flex"
            )}
          />

          <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-[240px] border-r border-panel-border bg-transparent p-0 shadow-none sm:max-w-[240px]"
            >
              <AppSidebar onNavigate={() => setMobileSidebarOpen(false)} className="border-r-0" />
            </SheetContent>
          </Sheet>

          <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">
              <div className="pointer-events-none sticky top-0 z-[var(--z-sticky)]">
                  <div className="pointer-events-auto flex justify-end px-4 pt-4 sm:px-6 sm:pt-5 xl:px-8">
                    <UtilityCluster onToggleSidebar={() => setMobileSidebarOpen(true)} />
                  </div>
                </div>
              <div className={`w-full ${hasPageHeader ? "py-4 sm:py-5" : "pt-0 pb-4 sm:pb-5"}`}>
                <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 xl:px-8">
                  <div className="pb-5">
                    {children}
                  </div>
                </div>
              </div>
            </main>
            <HitokotoFooter />
          </div>
        </div>
      </div>
    </AppShellContext.Provider>
  )
}
