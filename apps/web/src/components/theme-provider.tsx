"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"

type Theme = "light" | "dark" | "system"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

const subscribers = new Set<() => void>()
function subscribe(cb: () => void) {
  subscribers.add(cb)
  return () => subscribers.delete(cb)
}

let currentTheme: Theme = "system"
try {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("thunder-theme") as Theme | null
    if (stored) currentTheme = stored
  }
} catch {}

function persistTheme(theme: Theme) {
  currentTheme = theme
  try {
    localStorage.setItem("thunder-theme", theme)
  } catch {}
  subscribers.forEach((cb) => cb())
}

const SERVER_SNAPSHOT: Theme = "system"

let cachedSnapshot: Theme | null = null
let cachedTheme: Theme | null = null

function getSnapshot(): Theme {
  if (cachedSnapshot && cachedTheme === currentTheme) {
    return cachedSnapshot
  }
  cachedTheme = currentTheme
  cachedSnapshot = currentTheme
  return cachedSnapshot
}

function getServerSnapshot(): Theme {
  return SERVER_SNAPSHOT
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const resolvedTheme = useMemo(() => {
    if (typeof window === "undefined") return "light"
    return theme === "system" ? getSystemTheme() : theme
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    if (theme !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      subscribers.forEach((cb) => cb())
    }
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    persistTheme(t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
