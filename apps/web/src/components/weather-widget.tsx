"use client"

import { useEffect, useState } from "react"
import { Cloud, CloudSun, Sun, CloudRain, CloudSnow, CloudFog, Loader2 } from "lucide-react"
import { createApiClients } from "@thunder/api-client"
import type { WeatherNow } from "@thunder/api-client"

const DEFAULT_LOCATION = "101010100"

function WeatherIcon({ text }: { text: string }) {
  if (text.includes("晴") && !text.includes("多") && !text.includes("少")) {
    return <Sun className="h-3.5 w-3.5 text-warning/80" />
  }
  if (text.includes("多云") || text.includes("少云")) {
    return <CloudSun className="h-3.5 w-3.5 text-warning/80" />
  }
  if (text.includes("阴") || (text.includes("云") && !text.includes("多"))) {
    return <Cloud className="h-3.5 w-3.5 text-warning/80" />
  }
  if (text.includes("雨")) {
    return <CloudRain className="h-3.5 w-3.5 text-warning/80" />
  }
  if (text.includes("雪")) {
    return <CloudSnow className="h-3.5 w-3.5 text-warning/80" />
  }
  if (text.includes("雾") || text.includes("霾") || text.includes("沙")) {
    return <CloudFog className="h-3.5 w-3.5 text-warning/80" />
  }
  return <CloudSun className="h-3.5 w-3.5 text-warning/80" />
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const clients = createApiClients()
    clients.weather
      .getNow(DEFAULT_LOCATION)
      .then((data) => {
        setWeather(data)
        setError(false)
      })
      .catch(() => {
        setError(true)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </div>
    )
  }

  if (error || !weather) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80">
      <WeatherIcon text={weather.text} />
      <span className="font-medium tabular-nums">{weather.temp}°</span>
      <span className="hidden sm:inline text-muted-foreground/60">{weather.text}</span>
      <span className="hidden md:inline text-muted-foreground/50">· {weather.city}</span>
    </div>
  )
}
