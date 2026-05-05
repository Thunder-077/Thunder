"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState("thunder")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null) as { message?: string } | null
        setError(data?.message || "登录失败，请检查账号和密码")
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
    <main className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_440px]">
        <section className="relative hidden overflow-hidden border-r border-border/70 bg-muted/20 px-12 py-10 lg:flex lg:flex-col">
          <div className="flex items-center gap-3">
            <img src="/logo-sidebar.png" alt="Thunder" className="h-10 w-10 object-contain" />
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground">Thunder</div>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-[600px]">
              <img
                src="/illustrations/secure-login-storyset.svg"
                alt="安全登录"
                className="max-h-[560px] w-full object-contain"
              />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10">
          <div className="w-full max-w-[360px]">
            <div className="mb-8 lg:hidden">
              <img src="/logo-sidebar.png" alt="Thunder" className="h-11 w-11 object-contain" />
            </div>

            <div className="mb-8">
              <p className="text-sm font-medium text-muted-foreground">欢迎回来</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">登录 Thunder</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                使用你的访问账号进入个人工作空间。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-foreground">账号</label>
                <Input
                  id="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  placeholder="thunder"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-foreground">密码</label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="输入密码"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-11 w-full gap-2" disabled={loading}>
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                登录
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
