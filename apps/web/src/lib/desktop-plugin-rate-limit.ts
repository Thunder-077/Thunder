/**
 * Sliding-window rate limiter for plugin bridge calls.
 *
 * Unlike a fixed-window limiter that resets all counters at the window
 * boundary (allowing 2× burst at the boundary), this implementation
 * tracks individual call timestamps and enforces a true sliding window.
 */
export class DesktopPluginRateLimiter {
  private bridgeTimestamps: number[] = []
  private networkTimestamps: number[] = []
  private layoutTimestamps: number[] = []

  constructor(
    private readonly windowMs = 60_000,
    private readonly bridgeLimit = 120,
    private readonly networkLimit = 20,
    private readonly layoutLimit = 240,
  ) {}

  assertAllowedMethod(method: string, now = Date.now()): void {
    if (method === "layout.setFrameHeight") {
      const windowStart = now - this.windowMs
      this.layoutTimestamps = this.layoutTimestamps.filter((ts) => ts > windowStart)
      if (this.layoutTimestamps.length >= this.layoutLimit) {
        throw new Error("插件布局更新过于频繁")
      }
      this.layoutTimestamps.push(now)
      return
    }

    this.assertAllowed(method === "network.request", now)
  }

  assertAllowed(isNetwork: boolean, now = Date.now()): void {
    // Evict expired timestamps from the sliding window.
    const windowStart = now - this.windowMs
    this.bridgeTimestamps = this.bridgeTimestamps.filter((ts) => ts > windowStart)

    if (this.bridgeTimestamps.length >= this.bridgeLimit) {
      throw new Error("插件 Host Bridge 调用过于频繁")
    }
    this.bridgeTimestamps.push(now)

    if (isNetwork) {
      this.networkTimestamps = this.networkTimestamps.filter((ts) => ts > windowStart)
      if (this.networkTimestamps.length >= this.networkLimit) {
        throw new Error("插件网络请求过于频繁")
      }
      this.networkTimestamps.push(now)
    }
  }
}
