"use client"

import { useState } from "react"
import { PasswordInput } from "@/components/ui/password-input"
import { PasswordStrengthMeter } from "./password-strength-meter"
import { Button } from "@/components/ui/button"

interface MasterPasswordFormProps {
  onSubmit: (password: string) => Promise<void>
  submitLabel: string
  requireConfirm?: boolean
}

export function MasterPasswordForm({
  onSubmit,
  submitLabel,
  requireConfirm = false,
}: MasterPasswordFormProps) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!password) {
      setError("请输入主密码")
      return
    }
    if (requireConfirm && password !== confirmPassword) {
      setError("两次输入的密码不一致")
      return
    }

    setLoading(true)
    try {
      await onSubmit(password)
    } catch {
      setError("操作失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="mp-password">
          主密码
        </label>
        <PasswordInput
          id="mp-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="输入主密码"
        />
        {requireConfirm && <PasswordStrengthMeter password={password} />}
      </div>

      {requireConfirm && (
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="mp-confirm">
            确认主密码
          </label>
          <PasswordInput
            id="mp-confirm"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入主密码"
          />
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "处理中..." : submitLabel}
      </Button>
    </form>
  )
}
