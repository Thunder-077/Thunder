import { Brain } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"

export default function AiHubPage() {
  return (
    <div>
      <PageHeader
        title="AI 中心"
        description="管理 AI 账号和查看额度（示例模块）"
      />
      <EmptyState
        icon={<Brain className="h-6 w-6" />}
        title="AI 中心"
        description="此模块为示例占位，暂未实现账号管理和额度查看功能"
      />
    </div>
  )
}
