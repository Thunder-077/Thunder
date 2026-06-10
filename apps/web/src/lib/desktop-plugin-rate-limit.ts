export class DesktopPluginRateLimiter {
  private windowStartedAt: number | null = null
  private bridgeCount = 0
  private networkCount = 0

  constructor(
    private readonly windowMs = 60_000,
    private readonly bridgeLimit = 120,
    private readonly networkLimit = 20,
  ) {}

  assertAllowed(isNetwork: boolean, now = Date.now()): void {
    if (this.windowStartedAt === null || now - this.windowStartedAt >= this.windowMs) {
      this.windowStartedAt = now
      this.bridgeCount = 0
      this.networkCount = 0
    }
    this.bridgeCount += 1
    if (this.bridgeCount > this.bridgeLimit) {
      throw new Error("插件 Host Bridge 调用过于频繁")
    }
    if (isNetwork) {
      this.networkCount += 1
      if (this.networkCount > this.networkLimit) {
        throw new Error("插件网络请求过于频繁")
      }
    }
  }
}
