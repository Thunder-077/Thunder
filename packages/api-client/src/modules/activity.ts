import { ThunderClient } from "../client"
import type { ApiResponse, PaginatedData } from "@thunder/contracts"

export interface ActivityRecord {
  id: string
  module: string
  action: string
  title: string
  description: string | null
  metadataJson: string | null
  createdAt: string
}

export interface RecordActivityParams {
  module: string
  action: string
  title: string
  description?: string
  metadataJson?: string
}

export interface ListActivitiesParams {
  page?: number
  pageSize?: number
  module?: string
}

export class ActivityClient extends ThunderClient {
  async listActivities(params: ListActivitiesParams = {}): Promise<ApiResponse<PaginatedData<ActivityRecord>>> {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.set("page", String(params.page))
    if (params.pageSize) searchParams.set("pageSize", String(params.pageSize))
    if (params.module) searchParams.set("module", params.module)
    const query = searchParams.toString()
    return this.get(`/activities${query ? `?${query}` : ""}`)
  }

  async recordActivity(params: RecordActivityParams): Promise<ApiResponse<{ activity: ActivityRecord }>> {
    return this.post("/activities", params)
  }

  async deleteActivity(id: string): Promise<ApiResponse<null>> {
    return this.del(`/activities/${id}`)
  }

  async clearActivities(): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.del("/activities")
  }
}
