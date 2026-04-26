"use client"

import { useState } from "react"
import { Lock, AlertTriangle } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent } from "@/components/ui/card"
import { useVault } from "../state"

export function VaultUnlockPage() {
  const { unlockVault, clearVault, loading, error: contextError } = useVault()
  const [masterPassword, setMasterPassword] = useState("")
  const [validationError, setValidationError] = useState("")

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

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="解锁密码保险箱"
        description="输入主密码来访问你的密码"
      />

      <form onSubmit={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="h-6 w-6" />
              </div>
            </div>

            <div className="space-y-2">
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

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "解锁中..." : "解锁"}
            </Button>
          </CardContent>
        </Card>
      </form>

      <div className="mt-4">
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          重置本地保险箱
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            如果忘记主密码，只能重置保险箱，所有数据将被清除且无法恢复。
          </p>
        </div>
      </div>
    </div>
  )
}
