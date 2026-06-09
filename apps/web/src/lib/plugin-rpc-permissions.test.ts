import assert from "node:assert/strict"
import { getRequiredPermissionForRpcMethod } from "./plugin-rpc-permissions"

assert.equal(getRequiredPermissionForRpcMethod("storage.get"), "storage")
assert.equal(getRequiredPermissionForRpcMethod("worker.invoke"), "native-runtime")
assert.equal(getRequiredPermissionForRpcMethod("notification.add"), "notifications")
assert.equal(getRequiredPermissionForRpcMethod("activity.track"), "activity")

console.log("[plugin-rpc-permissions] tests passed")
