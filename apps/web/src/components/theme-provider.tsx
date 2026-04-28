"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"

type Theme = "light" | "dark" | "system"
type BrandTheme = "violet" | "blue"

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
  brandTheme: BrandTheme
  setBrandTheme: (brand: BrandTheme) => void
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

let currentBrand: BrandTheme = "violet"
try {
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("thunder-brand") as BrandTheme | null
    if (stored === "blue") currentBrand = stored
  }
} catch {}

function persistTheme(theme: Theme) {
  currentTheme = theme
  try {
    localStorage.setItem("thunder-theme", theme)
  } catch {}
  subscribers.forEach((cb) => cb())
}

function persistBrand(brand: BrandTheme) {
  currentBrand = brand
  try {
    localStorage.setItem("thunder-brand", brand)
  } catch {}
  subscribers.forEach((cb) => cb())
}

const SERVER_SNAPSHOT: [Theme, BrandTheme] = ["system", "violet"]

let cachedSnapshot: [Theme, BrandTheme] | null = null
let cachedTheme: Theme | null = null
let cachedBrand: BrandTheme | null = null

function getSnapshot(): [Theme, BrandTheme] {
  if (cachedSnapshot && cachedTheme === currentTheme && cachedBrand === currentBrand) {
    return cachedSnapshot
  }
  cachedTheme = currentTheme
  cachedBrand = currentBrand
  cachedSnapshot = [currentTheme, currentBrand]
  return cachedSnapshot
}

function getServerSnapshot(): [Theme, BrandTheme] {
  return SERVER_SNAPSHOT
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const theme = snapshot[0]
  const brandTheme = snapshot[1]

  const resolvedTheme = useMemo(() => {
    if (typeof window === "undefined") return "light"
    return theme === "system" ? getSystemTheme() : theme
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  }, [resolvedTheme])

  useEffect(() => {
    document.documentElement.setAttribute("data-brand", brandTheme)
  }, [brandTheme])

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

  const setBrandTheme = useCallback((b: BrandTheme) => {
    persistBrand(b)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, brandTheme, setBrandTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider")
  return ctx
}
