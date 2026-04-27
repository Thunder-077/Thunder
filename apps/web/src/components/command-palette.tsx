"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Puzzle,
  CheckSquare,
  Lock,
  Brain,
  Settings,
  Sun,
  Moon,
  Search,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | undefined>(undefined)

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider")
  return ctx
}

interface Command {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  keywords?: string[]
}

function useCommands(): Command[] {
  const router = useRouter()
  const { setTheme, resolvedTheme } = useTheme()

  return [
    {
      id: "home",
      label: "跳转首页",
      icon: LayoutDashboard,
      keywords: ["home", "首页", "dashboard"],
      action: () => router.push("/"),
    },
    {
      id: "modules",
      label: "打开模块中心",
      icon: Puzzle,
      keywords: ["modules", "模块", "中心"],
      action: () => router.push("/modules"),
    },
    {
      id: "todo",
      label: "打开待办事项",
      icon: CheckSquare,
      keywords: ["todo", "待办", "事项"],
      action: () => router.push("/modules/todo"),
    },
    {
      id: "vault",
      label: "打开密码保险箱",
      icon: Lock,
      keywords: ["vault", "密码", "保险箱"],
      action: () => router.push("/vault"),
    },
    {
      id: "ai-hub",
      label: "打开 AI 中心",
      icon: Brain,
      keywords: ["ai", "hub", "中心", "智能"],
      action: () => router.push("/modules/ai-hub"),
    },
    {
      id: "settings",
      label: "打开设置",
      icon: Settings,
      keywords: ["settings", "设置"],
      action: () => router.push("/settings"),
    },
    {
      id: "toggle-theme",
      label: "切换主题",
      icon: resolvedTheme === "dark" ? Sun : Moon,
      keywords: ["theme", "主题", "切换", "dark", "light"],
      action: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
    },
  ]
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      {open && <CommandPaletteDialog />}
    </CommandPaletteContext.Provider>
  )
}

function CommandPaletteDialog() {
  const { setOpen } = useCommandPalette()
  const commands = useCommands()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = commands.filter((cmd) => {
    if (!query.trim()) return true
    const q = query.toLowerCase()
    return (
      cmd.label.toLowerCase().includes(q) ||
      cmd.keywords?.some((kw) => kw.toLowerCase().includes(q))
    )
  })

  const clampedIndex = Math.min(selectedIndex, Math.max(filtered.length - 1, 0))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const executeCommand = useCallback(
    (cmd: Command) => {
      setOpen(false)
      cmd.action()
    },
    [setOpen]
  )

  function handleQueryChange(value: string) {
    setQuery(value)
    setSelectedIndex(0)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % filtered.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length)
    } else if (e.key === "Enter" && filtered[clampedIndex]) {
      e.preventDefault()
      executeCommand(filtered[clampedIndex])
    }
  }

  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector("[data-selected='true']")
    selected?.scrollIntoView({ block: "nearest" })
  }, [clampedIndex])

  return (
    <Dialog open onOpenChange={setOpen}>
      <DialogContent
        hideClose
        className="sm:max-w-md p-0 gap-0 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="输入命令或搜索…"
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:border-0"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              未找到匹配的命令
            </p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                data-selected={i === clampedIndex}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  i === clampedIndex
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground"
                )}
              >
                <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left">{cmd.label}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
