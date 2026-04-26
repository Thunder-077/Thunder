"use client"

export type PasswordStrengthLevel = 0 | 1 | 2 | 3 | 4

export interface PasswordStrengthResult {
  level: PasswordStrengthLevel
  label: string
  color: string
}

export function getPasswordStrength(password: string): PasswordStrengthResult {
  if (!password) return { level: 0, label: "", color: "" }

  let score = 0
  if (password.length >= 6) score++
  if (password.length >= 10) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { level: 1, label: "弱", color: "bg-yellow-400" }
  if (score <= 2) return { level: 2, label: "一般", color: "bg-yellow-500" }
  if (score <= 3) return { level: 3, label: "较强", color: "bg-emerald-400" }
  return { level: 4, label: "很强", color: "bg-emerald-500" }
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
                i < level
                  ? getPasswordStrength(password).color
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
        {password && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {label}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        建议至少 6 位，包含大小写字母、数字与符号
      </p>
    </div>
  )
}
