import { prisma } from "@thunder/database"

export const MAX_ACTIVITY_LOGS = 200

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

export interface ActivityLogRecord {
  id: string
  module: string
  action: string
  title: string
  description: string | null
  metadataJson: string | null
  createdAt: string
}

function now(): string {
  return new Date().toISOString()
}

function generateId(): string {
  return crypto.randomUUID()
}

export function getOverflowActivityIds(
  records: Array<Pick<ActivityLogRecord, "id">>,
  maxActivityLogs = MAX_ACTIVITY_LOGS
): string[] {
  if (records.length <= maxActivityLogs) {
    return []
  }

  return records.slice(maxActivityLogs).map((record) => record.id)
}

export async function recordActivity(params: RecordActivityParams): Promise<ActivityLogRecord> {
  const id = generateId()
  const createdAt = now()
  await prisma.activityLog.create({
    data: {
      id,
      module: params.module,
      action: params.action,
      title: params.title,
      description: params.description ?? null,
      metadataJson: params.metadataJson ?? null,
      createdAt,
    },
  })

  // Keep recent activity bounded so the dashboard remains lightweight
  // and the desktop SQLite database does not grow without limit.
  const overflowRecords = await prisma.activityLog.findMany({
    select: { id: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
  const overflowIds = getOverflowActivityIds(overflowRecords)
  if (overflowIds.length > 0) {
    await prisma.activityLog.deleteMany({
      where: {
        id: {
          in: overflowIds,
        },
      },
    })
  }

  return { id, module: params.module, action: params.action, title: params.title, description: params.description ?? null, metadataJson: params.metadataJson ?? null, createdAt }
}

export async function listActivities(params: ListActivitiesParams = {}) {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20))
  const where = params.module ? { module: params.module } : {}

  const [items, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activityLog.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export async function deleteActivity(id: string): Promise<boolean> {
  const existing = await prisma.activityLog.findUnique({ where: { id } })
  if (!existing) return false
  await prisma.activityLog.delete({ where: { id } })
  return true
}

export async function clearActivities(): Promise<number> {
  const result = await prisma.activityLog.deleteMany()
  return result.count
}
