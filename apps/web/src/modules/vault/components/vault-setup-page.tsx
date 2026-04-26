"use client"

import { useState } from "react"
import { Shield, Lock, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PasswordStrengthMeter } from "./password-strength-meter"
import { useVault } from "../state"

export function VaultSetupPage() {
  const { createVault, loading, error: contextError } = useVault()
  const [masterPassword, setMasterPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordHint, setPasswordHint] = useState("")
  const [acceptedRisk, setAcceptedRisk] = useState(false)
  const [validationError, setValidationError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError("")

    if (!masterPassword) {
      setValidationError("请输入主密码")
      return
    }
    if (masterPassword.length < 6) {
      setValidationError("主密码至少需要 6 个字符")
      return
    }
    if (!confirmPassword) {
      setValidationError("请再次输入主密码")
      return
    }
    if (masterPassword !== confirmPassword) {
      setValidationError("两次输入的密码不一致")
      return
    }
    if (!acceptedRisk) {
      setValidationError("请确认已知晓主密码无法找回")
      return
    }

    const hint = passwordHint.trim()
    if (hint.length > 120) {
      setValidationError("密码提示不能超过 120 个字符")
      return
    }
    if (hint && hint === masterPassword) {
      setValidationError("密码提示不能与主密码相同")
      return
    }
    if (hint && masterPassword.includes(hint)) {
      setValidationError("密码提示不能包含主密码")
      return
    }

    await createVault(masterPassword, hint || undefined)
  }

  const displayError = validationError || contextError

  return (
    <div className="mx-auto max-w-[640px]">
      <div className="mb-8 pt-2">
        <h1 className="text-xl font-semibold tracking-tight text-center">创建密码保险箱</h1>
        <p className="mt-1.5 text-sm text-muted-foreground text-center">
          设置一个主密码，用于加密保护你的账号、密钥和备注。
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="rounded-2xl border-border/80">
          <CardContent className="space-y-6 p-7">
            <div className="flex items-center justify-center pt-1">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                <Shield className="h-7 w-7" />
                <Lock className="absolute h-4 w-4" />
              </div>
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium" htmlFor="master-password">
                主密码
              </label>
              <PasswordInput
                id="master-password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="请输入主密码"
                className="h-10"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium" htmlFor="confirm-password">
                确认主密码
              </label>
              <PasswordInput
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入主密码"
                className="h-10"
              />
            </div>

            <div className="space-y-2.5">
              <label className="text-sm font-medium" htmlFor="password-hint">
                密码提示（可选） 
              </label>
              <Input
                id="password-hint"
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder="例如：与某个只有你知道的短语有关"
                className="h-10"
              />
            </div>

            <div className="space-y-2.5">
              <span className="text-sm font-medium">密码强度</span>
              <PasswordStrengthMeter password={masterPassword} />
            </div>

            {displayError && (
              <p className="text-xs text-destructive">{displayError}</p>
            )}

            <div className="flex items-start gap-2.5">
              <Checkbox
                checked={acceptedRisk}
                onCheckedChange={(checked) => setAcceptedRisk(checked === true)}
                id="accepted-risk"
                className="mt-0.5"
              />
              <label htmlFor="accepted-risk" className="text-sm text-muted-foreground leading-relaxed cursor-pointer select-none">
                我已知晓：主密码不会明文存储，忘记后无法找回
              </label>
            </div>

            <div className="space-y-2.5 pt-0.5">
              <Button
                type="submit"
                className="h-[42px] w-full text-sm"
                disabled={loading}
              >
                {loading ? "创建中..." : "创建保险箱"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-[42px] w-full text-sm"
                onClick={() => window.history.back()}
              >
                取消
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <div className="mt-5 rounded-xl bg-muted/50 px-4 py-4">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground/70">安全提示</p>
            <ul className="space-y-1 text-xs text-muted-foreground/60 leading-relaxed list-disc pl-5">
              <li>主密码仅用于本地解锁，不会明文存储。</li>
              <li>请妥善保管主密码，忘记后无法为你恢复。</li>
              <li>创建后可在密码保险箱中管理网站账号、密钥和备注。</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
