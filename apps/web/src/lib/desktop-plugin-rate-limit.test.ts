import assert from "node:assert/strict"
import { DesktopPluginRateLimiter } from "./desktop-plugin-rate-limit"

const limiter = new DesktopPluginRateLimiter(60_000, 2, 1)
limiter.assertAllowed(false, 0)
limiter.assertAllowed(true, 0)
assert.throws(() => limiter.assertAllowed(false, 0), /Bridge 调用过于频繁/)

const networkLimiter = new DesktopPluginRateLimiter(60_000, 10, 1)
networkLimiter.assertAllowed(true, 0)
assert.throws(() => networkLimiter.assertAllowed(true, 0), /网络请求过于频繁/)
networkLimiter.assertAllowed(true, 60_001)

console.log("[desktop-plugin-rate-limit] tests passed")
