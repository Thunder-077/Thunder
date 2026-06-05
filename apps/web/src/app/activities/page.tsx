"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { ActivityList } from "@/components/activity-list"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"

export default function ActivitiesPage() {
  return (
    <div>
      <PageHeader
        title="最近活动"
        actions={(
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              返回
            </Button>
          </Link>
        )}
      />
      <ActivityList limit={50} />
    </div>
  )
}
