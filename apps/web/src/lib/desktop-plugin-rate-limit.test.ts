import assert from "node:assert/strict"
import { DesktopPluginRateLimiter } from "./desktop-plugin-rate-limit"

// ---- Basic limit enforcement ----
const limiter = new DesktopPluginRateLimiter(60_000, 2, 1)
limiter.assertAllowed(false, 0)
limiter.assertAllowed(true, 0)
assert.throws(() => limiter.assertAllowed(false, 0), /Bridge 调用过于频繁/)

// ---- Network sub-limit ----
const networkLimiter = new DesktopPluginRateLimiter(60_000, 10, 1)
networkLimiter.assertAllowed(true, 0)
assert.throws(() => networkLimiter.assertAllowed(true, 0), /网络请求过于频繁/)
networkLimiter.assertAllowed(true, 60_001)

// ---- Layout updates have an independent limit ----
const layoutLimiter = new DesktopPluginRateLimiter(60_000, 1, 1, 2)
layoutLimiter.assertAllowedMethod("layout.setFrameHeight", 0)
layoutLimiter.assertAllowedMethod("layout.setFrameHeight", 0)
assert.throws(() => layoutLimiter.assertAllowedMethod("layout.setFrameHeight", 0), /布局更新过于频繁/)
layoutLimiter.assertAllowedMethod("storage.get", 0)
assert.throws(() => layoutLimiter.assertAllowedMethod("storage.get", 0), /Bridge 调用过于频繁/)

// ---- Speech stream worker calls have an independent high-frequency quota ----
const speechLimiter = new DesktopPluginRateLimiter(60_000, 1, 1, 1, 3)
speechLimiter.assertAllowedMethod("worker.invoke", { method: "speech.session.feed" }, 0)
speechLimiter.assertAllowedMethod("worker.invoke", { method: "speech.session.feed" }, 0)
speechLimiter.assertAllowedMethod("worker.invoke", { method: "speech.session.feed" }, 0)
assert.throws(
  () => speechLimiter.assertAllowedMethod("worker.invoke", { method: "speech.session.feed" }, 0),
  /语音流调用过于频繁/,
)
speechLimiter.assertAllowedMethod("storage.get", undefined, 0)
assert.throws(() => speechLimiter.assertAllowedMethod("storage.get", undefined, 0), /Bridge 调用过于频繁/)

// ---- Sliding window: no burst at boundary ----
// With a fixed-window limiter, calling at 59_999 and 60_001 would both succeed
// because the window resets. With a sliding window, the first call at 59_999
// is still inside the window at 60_001 (window = 60_001 - 60_000 = 1).
const slidingLimiter = new DesktopPluginRateLimiter(60_000, 2, 2)
slidingLimiter.assertAllowed(false, 59_999)
slidingLimiter.assertAllowed(false, 59_999)
// At t=60_001, the window covers [1, 60_001]. The two calls at 59_999 are still inside.
assert.throws(
  () => slidingLimiter.assertAllowed(false, 60_001),
  /Bridge 调用过于频繁/,
  "sliding window should not allow burst at boundary",
)
// But at t=120_000, those old calls have expired.
slidingLimiter.assertAllowed(false, 120_000)

// ---- Gradual expiration ----
const gradualLimiter = new DesktopPluginRateLimiter(100, 3, 3)
gradualLimiter.assertAllowed(true, 0)
gradualLimiter.assertAllowed(true, 50)
gradualLimiter.assertAllowed(true, 90)
// All 3 slots full.
assert.throws(() => gradualLimiter.assertAllowed(true, 95), /Bridge 调用过于频繁/)
// At t=101, the first call (t=0) has expired, freeing one slot.
gradualLimiter.assertAllowed(true, 101)
// But only one slot freed, so next should fail.
assert.throws(() => gradualLimiter.assertAllowed(true, 102), /Bridge 调用过于频繁/)
// At t=151, two more have expired (t=50 expired at 150).
gradualLimiter.assertAllowed(true, 151)

console.log("[desktop-plugin-rate-limit] tests passed")
