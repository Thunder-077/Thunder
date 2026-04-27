"use client"

import { AlertTriangle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useDialog } from "@/hooks/use-dialog"
import { useVault } from "../state"

export function VaultDangerZone() {
  const { clearVault } = useVault()
  const dialog = useDialog()

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

  return (
    <Card className="border-destructive/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-destructive">危险区域</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              重置保险箱将删除所有本地数据，包括所有密码条目和保险箱元信息。此操作不可撤销。
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3 gap-1"
              onClick={handleReset}
            >
              <Trash2 className="h-3.5 w-3.5" />
              重置保险箱
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
