import { Hono } from "hono"
import { cors } from "hono/cors"
import { apiSuccess, apiError } from "@thunder/contracts"
import { recordActivity, listActivities, deleteActivity, clearActivities } from "./activity-service"
import type { RecordActivityParams } from "./activity-service"

const activities = new Hono()

activities.use("*", cors())

// GET /activities - List activities with pagination and module filter
activities.get("/", async (c) => {
  try {
    const page = Number(c.req.query("page")) || undefined
    const pageSize = Number(c.req.query("pageSize")) || undefined
    const module = c.req.query("module") || undefined
    const result = await listActivities({ page, pageSize, module })
    return c.json(apiSuccess(result))
  } catch (error) {
    console.error("[activity-api] GET /activities failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取活动列表失败"), 500)
  }
})

// POST /activities - Record a new activity
activities.post("/", async (c) => {
  try {
    const body = await c.req.json<RecordActivityParams>()
    if (!body.module || !body.action || !body.title) {
      return c.json(apiError("VALIDATION_ERROR", "module、action 和 title 为必填字段"), 400)
    }
    const record = await recordActivity(body)
    return c.json(apiSuccess({ activity: record }), 201)
  } catch (error) {
    console.error("[activity-api] POST /activities failed", error)
    return c.json(apiError("INTERNAL_ERROR", "记录活动失败"), 500)
  }
})

// DELETE /activities/:id - Delete a single activity
activities.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const deleted = await deleteActivity(id)
    if (!deleted) {
      return c.json(apiError("ACTIVITY_NOT_FOUND", "活动记录不存在"), 404)
    }
    return c.json(apiSuccess(null))
  } catch (error) {
    console.error("[activity-api] DELETE /activities/:id failed", error)
    return c.json(apiError("ACTIVITY_DELETE_FAILED", "删除活动记录失败"), 500)
  }
})

// DELETE /activities - Clear all activities
activities.delete("/", async (c) => {
  try {
    const count = await clearActivities()
    return c.json(apiSuccess({ deletedCount: count }))
  } catch (error) {
    console.error("[activity-api] DELETE /activities failed", error)
    return c.json(apiError("ACTIVITY_DELETE_FAILED", "清空活动记录失败"), 500)
  }
})

export { activities }
