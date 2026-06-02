"use client"

import { useState } from "react"
import { CircleAlert, Shield, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { PasswordStrengthMeter } from "./password-strength-meter"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
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
  <div className="relative w-full pb-8 pt-2">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 bottom-0 z-0 hidden lg:block"
    >
      <img
        src="/illustrations/vault-setup-safe-storyset.svg"
        alt=""
        className="w-[620px] max-w-none translate-x-10 translate-y-12 opacity-[0.15] xl:w-[760px] xl:translate-x-16 xl:translate-y-25"
      />
    </div>

    <div className="relative z-10 mx-auto w-full max-w-[680px]">
      <div className="mb-8 flex flex-col items-center gap-6">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-subtle to-brand/10 text-brand shadow-sm">
        <Shield size={36} strokeWidth={1.8} />
        <Lock
          size={16}
          strokeWidth={3}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[48%]"
        />
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight">创建密钥管家</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          设置主密码后，所有数据将仅在你的设备上加密存储
        </p>
      </div>
      </div>

      <form onSubmit={handleSubmit} className="relative z-10 w-full">
      <Card className="w-full rounded-2xl border-border/80">
        <CardContent className="space-y-6 p-8">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="master-password">
              主密码
            </label>
            <PasswordInput
              id="master-password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="请输入主密码"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" htmlFor="confirm-password">
              确认主密码
            </label>
            <PasswordInput
              id="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入主密码"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <label className="text-sm font-medium" htmlFor="password-hint">
                密码提示（可选）
              </label>
              <Tooltip>
                <TooltipTrigger
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/30"
                  aria-label="查看安全提示"
                >
                  <CircleAlert className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  align="start"
                  className="max-w-64 items-start rounded-xl border border-callout-info-border bg-callout-info px-3.5 py-3 text-left text-callout-foreground shadow-md"
                >
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium">安全提示</p>
                    <ul className="space-y-1 text-xs leading-relaxed text-callout-muted">
                      <li>主密码仅用于本地解锁，不会明文存储。</li>
                      <li>请妥善保管主密码，忘记后无法为你恢复。</li>
                      <li>创建后可在密钥管家中管理网站账号、密钥和备注。</li>
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
            <Input
              id="password-hint"
              type="text"
              value={passwordHint}
              onChange={(e) => setPasswordHint(e.target.value)}
              placeholder="例如：与某个只有你知道的短语有关"
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
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
            <label
              htmlFor="accepted-risk"
              className="text-sm text-muted-foreground leading-relaxed cursor-pointer select-none"
            >
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
    </div>

  </div>
)
}
