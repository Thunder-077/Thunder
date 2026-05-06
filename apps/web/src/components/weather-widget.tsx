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
import { createApiClients } from "@thunder/api-client"
import type { WeatherNow } from "@thunder/api-client"

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

function WeatherIcon({ text }: { text: string }) {
  const value = text.trim()

  if (value.includes("雪")) {
    return <CloudSnow className="h-5 w-5 text-sky-500/80" />
  }

  if (value.includes("雨")) {
    return <CloudRain className="h-5 w-5 text-blue-500/80" />
  }

  if (
    value.includes("雾") ||
    value.includes("霾") ||
    value.includes("沙") ||
    value.includes("尘")
  ) {
    return <CloudFog className="h-5 w-5 text-muted-foreground/60" />
  }

  if (value.includes("晴")) {
    return <Sun className="h-5 w-5 text-amber-400" />
  }

  if (value.includes("多云") || value.includes("少云")) {
    return <CloudSun className="h-5 w-5 text-amber-400/85" />
  }

  if (value.includes("阴") || value.includes("云")) {
    return <Cloud className="h-5 w-5 text-muted-foreground/60" />
  }

  return <CloudSun className="h-5 w-5 text-amber-400/85" />
}

export function WeatherSummary() {
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadWeather() {
      try {
        const location = await resolveLocation()
        const clients = createApiClients()
        const data = await clients.weather.getNow(location)

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
      <div className="flex h-8 items-center gap-2 text-muted-foreground/50">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (error || !weather) {
    return null
  }

  return (
    <div
      className="flex items-center gap-2 text-sm font-medium text-foreground/85"
      title={`${weather.text} ${weather.temp}°`}
    >
      <WeatherIcon text={weather.text} />

      <span className="tabular-nums">
        {weather.temp}°
      </span>

      <span className="text-muted-foreground">
        {weather.text}
      </span>
    </div>
  )
}

export function WeatherWidget() {
  return <WeatherSummary />
}
