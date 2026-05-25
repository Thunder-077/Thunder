"use client"

import zxcvbn from "zxcvbn"

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel
  label: string
  color: string
  feedback: string
  crackTime: string
}

const strengthLabels: Record<PasswordStrengthLevel, string> = {
  0: "",
  1: "弱",
  2: "一般",
  3: "较强",
  4: "很强",
}

const strengthColors: Record<PasswordStrengthLevel, string> = {
  0: "",
  1: "bg-destructive",
  2: "bg-yellow-500",
  3: "bg-emerald-400",
  4: "bg-emerald-500",
}

function formatCrackTime(seconds: number): string {
  if (seconds < 1) return "瞬间"
  if (seconds < 60) return `${Math.round(seconds)}秒`
  if (seconds < 3600) return `${Math.round(seconds / 60)}分钟`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}小时`
  if (seconds < 31536000) return `${Math.round(seconds / 86400)}天`
  if (seconds < 3153600000) return `${Math.round(seconds / 31536000)}年`
  return "数千年"
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) {
    return { level: 0, label: "", color: "", feedback: "", crackTime: "" }
  }

  const result = zxcvbn(password)
  const level = result.score as PasswordStrengthLevel

  // 获取主要建议
  const warning = result.feedback.warning || ""
  const suggestions = result.feedback.suggestions
  let feedback = warning
  if (!feedback && suggestions.length > 0) {
    feedback = suggestions[0]
  }
  if (!feedback) {
    feedback = level >= 3 ? "密码强度不错" : "建议增加密码复杂度"
  }

  const crackTimeSeconds = result.crack_times_seconds.online_no_throttling_10_per_second as number

  return {
    level,
    label: strengthLabels[level],
    color: strengthColors[level],
    feedback,
    crackTime: formatCrackTime(crackTimeSeconds),
  }
}

interface PasswordStrengthMeterProps {
  password: string
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const { level, label } = getPasswordStrength(password)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < level ? getPasswordStrength(password).color : "bg-muted"
              }`}
            />
          ))}
        </div>
        {password && (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {label}
          </span>
        )}
      </div>
      {!password && (
        <p className="text-xs text-muted-foreground">
          建议至少 8 位，避免使用常见单词和简单模式
        </p>
      )}
    </div>
  )
}
