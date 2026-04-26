import { KeyRound } from "lucide-react"
import { EmptyState } from "@/components/empty-state"

export function VaultEmptyState() {
  return (
    <EmptyState
      icon={<KeyRound className="h-6 w-6" />}
      title="保险箱为空"
      description="点击上方「新增条目」按钮添加你的第一个密码条目"
    />
  )
}
