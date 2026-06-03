"use client"

import { useEffect, useState } from "react"
import {
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Sun,
} from "lucide-react"
import { WeatherClient, type WeatherNow } from "@thunder/api-client/modules/weather"
import { cn } from "@/lib/utils"

const DEFAULT_LOCATION = "101010100"
const GEO_CACHE_KEY = "thunder_geo_location"
const GEO_CACHE_TTL = 30 * 60 * 1000

interface GeoCache {
  location: string
  timestamp: number
}

function getCachedGeo(): string | null {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY)
    if (!raw) return null
    const cache: GeoCache = JSON.parse(raw)
    if (Date.now() - cache.timestamp > GEO_CACHE_TTL) {
      localStorage.removeItem(GEO_CACHE_KEY)
      return null
    }
    return cache.location
  } catch {
    return null
  }
}

function setCachedGeo(location: string) {
  try {
    const cache: GeoCache = { location, timestamp: Date.now() }
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

function requestGeolocation(): Promise<string> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(DEFAULT_LOCATION)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords
        const location = `${longitude.toFixed(2)},${latitude.toFixed(2)}`
        resolve(location)
      },
      () => {
        resolve(DEFAULT_LOCATION)
      },
      { timeout: 5000, maximumAge: GEO_CACHE_TTL }
    )
  })
}

async function resolveLocation(): Promise<string> {
  const cached = getCachedGeo()
  if (cached) return cached

  const location = await requestGeolocation()
  if (location !== DEFAULT_LOCATION) {
    setCachedGeo(location)
  }
  return location
}

function WeatherIcon({ text, compact = false }: { text: string; compact?: boolean }) {
  const size = compact ? "h-4 w-4" : "h-5 w-5"
  const value = text.trim()

  if (value.includes("雪")) {
    return <CloudSnow className={`${size} text-sky-500/80`} />
  }

  if (value.includes("雨")) {
    return <CloudRain className={`${size} text-blue-500/80`} />
  }

  if (
    value.includes("雾") ||
    value.includes("霾") ||
    value.includes("沙") ||
    value.includes("尘")
  ) {
    return <CloudFog className={`${size} text-muted-foreground/60`} />
  }

  if (value.includes("晴")) {
    return <Sun className={`${size} text-amber-400`} />
  }

  if (value.includes("多云") || value.includes("少云")) {
    return <CloudSun className={`${size} text-amber-400/85`} />
  }

  if (value.includes("阴") || value.includes("云")) {
    return <Cloud className={`${size} text-muted-foreground/60`} />
  }

  return <CloudSun className={`${size} text-amber-400/85`} />
}

export function WeatherSummary({ compact = false }: { compact?: boolean }) {
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadWeather() {
      try {
        const location = await resolveLocation()
        const data = await new WeatherClient().getNow(location)

        if (ignore) return

        setWeather(data)
        setError(false)
      } catch {
        if (!ignore) {
          setError(true)
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadWeather()

    return () => {
      ignore = true
    }
  }, [])

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 text-muted-foreground/50", compact ? "h-full" : "h-8")}>
        <Loader2 className={compact ? "h-3.5 w-3.5 animate-spin" : "h-4 w-4 animate-spin"} />
      </div>
    )
  }

  if (error || !weather) {
    return (
      <div
        className={cn(
          "flex items-center font-medium text-muted-foreground/60",
          compact ? "gap-1.5 text-xs" : "gap-2 text-sm"
        )}
        title="天气不可用，请检查桌面运行时配置"
      >
        <Cloud className={compact ? "h-4 w-4" : "h-5 w-5"} />
        <span className="tabular-nums">--°</span>
        {!compact && <span>天气不可用</span>}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex items-center font-medium text-foreground/85",
        compact ? "gap-1.5 text-xs" : "gap-2 text-sm"
      )}
      title={`${weather.text} ${weather.temp}°`}
    >
      <WeatherIcon text={weather.text} compact={compact} />

      <span className="tabular-nums">
        {weather.temp}°
      </span>

      {!compact && (
        <span className="text-muted-foreground">
          {weather.text}
        </span>
      )}
    </div>
  )
}

export function WeatherWidget() {
  return <WeatherSummary />
}
