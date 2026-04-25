import { Shield } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default function PasswordVaultPage() {
  return (
    <div>
      <PageHeader
        title="密码保险箱"
        description="安全管理密码和私密信息（示例模块）"
      />
      <EmptyState
        icon={<Shield className="h-6 w-6" />}
        title="密码保险箱"
        description="此模块为示例占位，暂未实现真实密码存储功能"
      />
    </div>
  )
}
