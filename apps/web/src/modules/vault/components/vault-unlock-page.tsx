"use client"

import { useState } from "react"
import { Lock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent } from "@/components/ui/card"
import { Callout } from "@/components/ui/callout"
import { useDialog } from "@/hooks/use-dialog"
import { useVault } from "../state"

export function VaultUnlockPage() {
  const { unlockVault, clearVault, metadata, loading, error: contextError } = useVault()
  const dialog = useDialog()
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
    const ok = await dialog.confirm({
      type: "danger",
      title: "重置密码保险箱？",
      description:
        "这将清除当前设备上的所有保险箱数据，此操作不可撤销。请确认你已无法找回主密码后再继续。",
      confirmText: "确认重置",
      cancelText: "取消",
    })
    if (!ok) {
      return
    }
    await clearVault()
  }

  const displayError = validationError || contextError
  const passwordHint = metadata?.passwordHint

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-8 pt-2 flex flex-col items-center gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-subtle text-brand shadow-sm">
          <Lock className="h-8 w-8" />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">解锁密码保险箱</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl border-border/80">
          <CardContent className="space-y-6 p-7">

            <div className="space-y-2.5">
              <label className="text-sm font-medium" htmlFor="unlock-password">
                主密码
              </label>
              <PasswordInput
                id="unlock-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="输入主密码"
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
              <Callout variant="info" title="密码提示" className="p-4">
                {passwordHint ?? "你尚未设置密码提示。"}
                <p className="text-xs text-callout-muted mt-1.5 leading-relaxed">
                  密码提示仅用于帮助你回忆主密码，不能用于恢复主密码。
                </p>
              </Callout>
            )}
          </CardContent>
        </Card>
      </form>
      <div className="mt-5 space-y-3">
        <Callout variant="warning" title="无法恢复主密码">
          <p className="text-xs text-muted-foreground leading-5">
            如果忘记主密码，只能
            <button
              type="button"
              onClick={handleReset}
              className="mx-1 font-bold text-destructive underline decoration-destructive/30 underline-offset-4 text-xs hover:text-destructive/80 focus:outline-none focus:ring-1 focus:ring-destructive/50 rounded-sm transition-colors"
            >
              重置保险箱
            </button>
            ，所有数据将被清除且无法恢复。
          </p>
        </Callout>
      </div>
    </div>
  )
}
