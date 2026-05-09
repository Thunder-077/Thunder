"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          "error-callback"?: (error: string) => void
          "expired-callback"?: () => void
          theme?: "light" | "dark" | "auto"
          size?: "normal" | "compact" | "flexible"
          retry?: "auto" | "never"
          "refresh-expired"?: "auto" | "manual"
          execution?: "render" | "execute"
          language?: string
          responseField?: boolean
          appearance?: "always" | "execute" | "interaction-only"
          [key: string]: unknown
        }
      ) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
      getResponse: (widgetId: string) => string | undefined
      isExpired: (widgetId: string) => boolean
      ready: (callback: () => void) => void
    }
  }
}

type TurnstileStatus = "loading" | "ready" | "verified" | "error" | "expired"

interface TurnstileProps {
  siteKey: string
  onToken: (token: string) => void
  onError?: (error: string) => void
  onExpire?: () => void
  theme?: "light" | "dark" | "auto"
  size?: "normal" | "compact"
}

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  onExpire,
  theme = "auto",
  size = "normal",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const renderedRef = useRef(false)
  const [status, setStatus] = useState<TurnstileStatus>("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [retryKey, setRetryKey] = useState(0)

  const handleRetry = useCallback(() => {
    setStatus("loading")
    setErrorMsg("")
    setRetryKey((k) => k + 1)
  }, [])

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || renderedRef.current) return

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        callback: (token: string) => {
          setStatus("verified")
          onToken(token)
        },
        "error-callback": (errorCode: string) => {
          renderedRef.current = false
          setStatus("error")
          setErrorMsg(errorCode || "人机验证加载失败")
          onError?.(errorCode)
        },
        "expired-callback": () => {
          setStatus("expired")
          onExpire?.()
        },
      })
      renderedRef.current = true
    } catch (e) {
      renderedRef.current = false
      const msg = e instanceof Error ? e.message : String(e)
      setStatus("error")
      setErrorMsg(msg)
      onError?.(msg)
    }
  }, [siteKey, theme, size, onToken, onError, onExpire])

  useEffect(() => {
    const scriptSrc = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

    function onReady() {
      setStatus("ready")
      renderWidget()
    }

    const existingScript = document.querySelector(`script[src="${scriptSrc}"]`) as HTMLScriptElement | null

    if (existingScript) {
      if (document.readyState === "complete") {
        onReady()
      } else {
        existingScript.addEventListener("load", onReady, { once: true })
      }
      return
    }

    const script = document.createElement("script")
    script.src = scriptSrc
    script.async = true
    script.defer = true
    script.addEventListener("load", onReady, { once: true })
    document.head.appendChild(script)

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
        widgetIdRef.current = null
      }
      renderedRef.current = false
    }
  }, [renderWidget, retryKey])

  if (status === "loading") {
    return (
      <div className={size === "compact" ? "h-[65px] w-[130px]" : "h-[65px] w-[300px]"}>
        <div className="h-full w-full rounded-xl border border-border/70 skeleton-block" />
      </div>
    )
  }

  if (status === "verified") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
        <CheckCircle className="h-4 w-4 shrink-0" />
        <span>验证通过</span>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="flex-1 text-sm text-destructive">{errorMsg || "人机验证加载失败"}</span>
        <button
          type="button"
          onClick={handleRetry}
          className="shrink-0 text-xs font-medium text-destructive underline underline-offset-2 transition-colors hover:text-destructive/80"
        >
          重试
        </button>
      </div>
    )
  }

  if (status === "expired") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950">
        <RefreshCw className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-sm text-amber-700 dark:text-amber-300">验证已过期</span>
        <button
          type="button"
          onClick={handleRetry}
          className="shrink-0 text-xs font-medium text-amber-600 underline underline-offset-2 transition-colors hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
        >
          重新验证
        </button>
      </div>
    )
  }

  return <div ref={containerRef} />
}
