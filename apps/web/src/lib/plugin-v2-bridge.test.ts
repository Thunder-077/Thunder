import assert from "node:assert/strict"
import { getRequiredPermissionForRpcMethod } from "./plugin-v2-bridge"

assert.equal(getRequiredPermissionForRpcMethod("storage.get"), "storage")
assert.equal(getRequiredPermissionForRpcMethod("worker.invoke"), "native-runtime")
assert.equal(getRequiredPermissionForRpcMethod("notifications.show"), "notifications")

console.log("[plugin-v2-bridge] tests passed")
