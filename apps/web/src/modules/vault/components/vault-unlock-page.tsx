"use client"

import { useState } from "react"
import { Lock, Lightbulb, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent } from "@/components/ui/card"
import { useVault } from "../state"

export function VaultUnlockPage() {
  const { unlockVault, clearVault, metadata, loading, error: contextError } = useVault()
  const [masterPassword, setMasterPassword] = useState("")
  const [validationError, setValidationError] = useState("")
  const [showPasswordHint, setShowPasswordHint] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError("")

    if (!masterPassword) {
      setValidationError("请输入主密码")
      return
    }

    await unlockVault(masterPassword)
  }

  const handleReset = async () => {
    if (!window.confirm("重置将删除本地保险箱中的所有数据，此操作不可撤销。确定要继续吗？")) {
      return
    }
    await clearVault()
  }

  const displayError = validationError || contextError
  const passwordHint = metadata?.passwordHint

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 pt-2">
        <h1 className="text-xl font-semibold tracking-tight text-center">解锁密码保险箱</h1>
        <p className="mt-1.5 text-sm text-muted-foreground text-center">
          输入主密码来访问你的账号、密钥和备注
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl border-border/80">
          <CardContent className="space-y-6 p-7">
            <div className="flex items-center justify-center pt-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                <Lock className="h-7 w-7" />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium" htmlFor="unlock-password">
                主密码
              </label>
              <PasswordInput
                id="unlock-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="输入主密码"
                className="h-10"
              />
            </div>

            {displayError && (
              <p className="text-xs text-destructive">{displayError}</p>
            )}

            <Button
              type="submit"
              className="h-[42px] w-full text-sm"
              disabled={loading}
            >
              {loading ? "解锁中..." : "解锁"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/60" />
              </div>
              <div className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => setShowPasswordHint((v) => !v)}
                  className="flex items-center gap-1 bg-background px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>忘记主密码？查看密码提示</span>
                  {showPasswordHint ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>

            {showPasswordHint && (
              <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Lightbulb className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm font-medium">密码提示</p>
                    <p className="text-sm text-muted-foreground">
                      {passwordHint ?? "你尚未设置密码提示。"}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  密码提示仅用于帮助你回忆主密码，不能用于恢复主密码。
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </form>

      <div className="mt-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive/70" />
          <span className="text-xs font-medium text-destructive/70">重置保险箱</span>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          如果忘记主密码，只能重置保险箱，所有数据将被清除且无法恢复。
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 h-8 text-xs text-destructive/80 hover:text-destructive border-destructive/20 hover:border-destructive/40"
          onClick={handleReset}
        >
          重置保险箱
        </Button>
      </div>
    </div>
  )
}
