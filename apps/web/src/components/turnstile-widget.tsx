"use client"

import { useEffect, useRef, useCallback, useState } from "react"

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

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || renderedRef.current) return

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        callback: (token: string) => {
          onToken(token)
        },
        "error-callback": (errorCode: string) => {
          renderedRef.current = false
          onError?.(errorCode)
        },
        "expired-callback": () => {
          onExpire?.()
        },
      })
      renderedRef.current = true
    } catch (e) {
      renderedRef.current = false
      onError?.(e instanceof Error ? e.message : String(e))
    }
  }, [siteKey, theme, size, onToken, onError, onExpire])

  useEffect(() => {
    const scriptSrc = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

    function onReady() {
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
  }, [renderWidget])

  return <div ref={containerRef} />
}
