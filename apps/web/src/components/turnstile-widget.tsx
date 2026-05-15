"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CheckCircle, RefreshCw } from "lucide-react"

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
  resetSignal?: number | string
  theme?: "light" | "dark" | "auto"
  size?: "normal" | "compact"
}

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

export function TurnstileWidget({
  siteKey,
  onToken,
  onError,
  onExpire,
  resetSignal,
  theme = "auto",
  size = "normal",
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const renderedRef = useRef(false)
  const previousResetSignalRef = useRef(resetSignal)
  const [status, setStatus] = useState<TurnstileStatus>("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [scriptReady, setScriptReady] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const removeWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore stale widget */ }
    }

    widgetIdRef.current = null
    renderedRef.current = false
  }, [])

  const handleRetry = useCallback(() => {
    removeWidget()
    setStatus("loading")
    setErrorMsg("")
    setRetryKey((key) => key + 1)
  }, [removeWidget])

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
      setStatus("ready")
    } catch (error) {
      renderedRef.current = false
      const message = error instanceof Error ? error.message : String(error)
      setStatus("error")
      setErrorMsg(message)
      onError?.(message)
    }
  }, [siteKey, theme, size, onToken, onError, onExpire])

  useEffect(() => {
    function markReady() {
      if (!window.turnstile) {
        setStatus("error")
        setErrorMsg("人机验证脚本加载失败")
        onError?.("turnstile-script-missing")
        return
      }

      setScriptReady(true)
    }

    function markError() {
      const failedScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`) as HTMLScriptElement | null
      if (failedScript) failedScript.dataset.turnstileStatus = "error"

      setStatus("error")
      setErrorMsg("人机验证脚本加载失败，请检查网络或稍后重试")
      onError?.("turnstile-script-load-failed")
    }

    if (window.turnstile) {
      markReady()
      return
    }

    const existingScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`) as HTMLScriptElement | null
    if (existingScript?.dataset.turnstileStatus === "error") {
      existingScript.remove()
    } else if (existingScript) {
      existingScript.addEventListener("load", markReady, { once: true })
      existingScript.addEventListener("error", markError, { once: true })

      return () => {
        existingScript.removeEventListener("load", markReady)
        existingScript.removeEventListener("error", markError)
      }
    }

    const script = document.createElement("script")
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.addEventListener("load", markReady, { once: true })
    script.addEventListener("error", markError, { once: true })
    document.head.appendChild(script)

    return () => {
      script.removeEventListener("load", markReady)
      script.removeEventListener("error", markError)
    }
  }, [onError, retryKey])

  useEffect(() => {
    if (!scriptReady) return

    const timer = window.setTimeout(renderWidget, 0)
    return () => window.clearTimeout(timer)
  }, [scriptReady, renderWidget, retryKey])

  useEffect(() => {
    if (previousResetSignalRef.current === resetSignal) return

    previousResetSignalRef.current = resetSignal
    handleRetry()
  }, [handleRetry, resetSignal])

  useEffect(() => removeWidget, [removeWidget])

  if (status === "loading" || status === "ready") {
    return (
      <div className={size === "compact" ? "min-h-[65px] w-[130px]" : "min-h-[65px] w-[300px]"}>
        {/* The target container must exist before the external script becomes ready. */}
        <div ref={containerRef} />
        {status === "loading" && (
          <div className="h-[65px] w-full rounded-xl border border-border/70 skeleton-block" />
        )}
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
      <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
        <span className="flex-1 text-sm text-destructive">{errorMsg || "人机验证加载失败"}</span>
        <button
          type="button"
          onClick={handleRetry}
          className="shrink-0 text-xs font-medium text-destructive underline underline-offset-2 transition-colors hover:opacity-80"
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
  return null
}
