import { Hono } from "hono"
import { cors } from "hono/cors"
import type { VaultMetadata, VaultItemRecord } from "@thunder/vault"
import { apiSuccess, apiError } from "@thunder/contracts"
import { VaultRepositorySQLite } from "./vault-repository.sqlite"
import { recordActivity } from "../activity/activity-service"

const repository = new VaultRepositorySQLite()
const vault = new Hono()

vault.use("*", cors())

vault.get("/metadata", async (c) => {
  try {
    const metadata = await repository.getMetadata()
    return c.json(apiSuccess({ metadata }))
  } catch (error) {
    console.error("[vault-api] GET /metadata failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取保险箱元信息失败"), 500)
  }
})

vault.put("/metadata", async (c) => {
  try {
    const body = await c.req.json<{ metadata: VaultMetadata }>()
    await repository.saveMetadata(body.metadata)
    return c.json(apiSuccess(null))
  } catch (error) {
    console.error("[vault-api] PUT /metadata failed", error)
    return c.json(apiError("INTERNAL_ERROR", "保存保险箱元信息失败"), 500)
  }
})

vault.get("/items", async (c) => {
  try {
    const vaultId = c.req.query("vaultId")
    if (!vaultId) {
      return c.json(apiError("VAULT_MISSING_VAULT_ID", "缺少 vaultId 参数"), 400)
    }
    const items = await repository.listItems(vaultId)
    return c.json(apiSuccess({ items }))
  } catch (error) {
    console.error("[vault-api] GET /items failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取条目列表失败"), 500)
  }
})

vault.get("/items/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const item = await repository.getItem(id)
    if (!item) {
      return c.json(apiError("VAULT_ITEM_NOT_FOUND", "条目不存在"), 404)
    }
    return c.json(apiSuccess({ item }))
  } catch (error) {
    console.error("[vault-api] GET /items/:id failed", error)
    return c.json(apiError("INTERNAL_ERROR", "获取条目失败"), 500)
  }
})

vault.put("/items/:id", async (c) => {
  try {
    const id = c.req.param("id")
    const body = await c.req.json<{ record: VaultItemRecord }>()
    await repository.saveItem({ ...body.record, id })
    try {
      await recordActivity({ module: "vault", action: "item.updated", title: "更新了密码条目" })
    } catch (e) {
      console.error("[vault-api] recordActivity failed", e)
    }
    return c.json(apiSuccess(null))
  } catch (error) {
    console.error("[vault-api] PUT /items/:id failed", error)
    return c.json(apiError("INTERNAL_ERROR", "保存条目失败"), 500)
  }
})

vault.delete("/items/:id", async (c) => {
  try {
    const id = c.req.param("id")
    await repository.deleteItem(id)
    try {
      await recordActivity({ module: "vault", action: "item.deleted", title: "删除了密码条目" })
    } catch (e) {
      console.error("[vault-api] recordActivity failed", e)
    }
    return c.json(apiSuccess(null))
  } catch (error) {
    console.error("[vault-api] DELETE /items/:id failed", error)
    return c.json(apiError("INTERNAL_ERROR", "删除条目失败"), 500)
  }
})

vault.post("/clear", async (c) => {
  try {
    await repository.clearVault()
    return c.json(apiSuccess(null))
  } catch (error) {
    console.error("[vault-api] POST /clear failed", error)
    return c.json(apiError("INTERNAL_ERROR", "清空保险箱失败"), 500)
  }
})

export { vault }
