"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { TurnstileWidget } from "@/components/turnstile-widget"

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("thunder")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [turnstileToken, setTurnstileToken] = useState("")
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError("")

    if (!turnstileToken) {
      setError("请完成人机验证")
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, turnstileToken }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        setError(data?.message || "登录失败，请检查账号和密码")
        setTurnstileToken("")
        setTurnstileResetKey((key) => key + 1)
        return
      }

      const next = new URLSearchParams(window.location.search).get("next") || "/"
      router.replace(next)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 p-2">
      <div className="grid min-h-[calc(100vh-16px)] overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm lg:grid-cols-[minmax(0,1fr)_500px]">
        <section className="relative hidden overflow-hidden bg-surface-2 px-12 py-10 lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <img src="/logo-sidebar.png" alt="Thunder" className="h-12 w-12 object-contain" />
            <div className="text-2xl font-semibold tracking-tight text-foreground">Thunder</div>
          </div>

          <div className="pointer-events-none absolute left-24 top-64 grid grid-cols-8 gap-2 opacity-40">
            {Array.from({ length: 48 }).map((_, index) => (
              <span key={index} className="h-1 w-1 rounded-full bg-brand/25" />
            ))}
          </div>

          <div className="relative mx-auto flex w-full max-w-[980px] flex-1 items-center justify-center">
            <div className="flex w-full items-end justify-center">
              <img
                src="/illustrations/secure-login-storyset.svg"
                alt="安全登录"
                className="max-h-[720px] w-full object-contain"
              />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-background p-3 lg:p-0">
          <div className="flex min-h-[calc(100vh-40px)] w-full items-center justify-center rounded-xl border border-border/70 bg-background px-6 py-10 shadow-lg shadow-slate-200/60 sm:px-10 lg:min-h-[calc(100vh-16px)] lg:rounded-l-xl lg:rounded-r-none lg:border-y-0 lg:border-r-0 lg:px-14">
            <div className="w-full max-w-[392px]">
              <div className="mb-10 lg:hidden">
                <img src="/logo-sidebar.png" alt="Thunder" className="h-11 w-11 object-contain" />
              </div>

              <div className="mb-9">
                <p className="text-base font-semibold text-brand">欢迎回来</p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">登录 Thunder</h1>

              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-3">
                  <label htmlFor="username" className="text-base font-medium text-foreground">账号</label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    className="h-14 rounded-xl px-5 text-lg"
                  />
                </div>

                <div className="space-y-3">
                  <label htmlFor="password" className="text-base font-medium text-foreground">密码</label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="输入密码"
                    className="h-14 rounded-xl px-5 text-lg"
                  />
                </div>

                {TURNSTILE_SITE_KEY && (
                  <div className="flex justify-start">
                    <TurnstileWidget
                      siteKey={TURNSTILE_SITE_KEY}
                      onToken={setTurnstileToken}
                      onExpire={() => setTurnstileToken("")}
                      resetSignal={turnstileResetKey}
                    />
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="h-14 w-full gap-3 rounded-xl text-lg shadow-md shadow-primary/20" disabled={loading}>
                  {loading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                  登录
                </Button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
