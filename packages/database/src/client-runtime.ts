const globalForPrisma = globalThis as unknown as {
  prismaConnectionString: string | undefined
  prisma: unknown | undefined
}

export function isSQLiteConnectionString(url?: string): boolean {
  return !!url && (url.startsWith("file:") || url.startsWith("sqlite:"))
}

export function resolveConnectionString(): string | undefined {
  return process.env.DATABASE_URL
}

function shouldReuseGlobalPrismaClient(): boolean {
  // Cloudflare Workers 会复用 isolate，但不允许把带 Native I/O 的对象跨请求复用。
  return !("WebSocketPair" in globalThis)
}

export function getCachedPrismaClient<TClient>(
  createClient: (connectionString: string) => TClient
): TClient {
  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (
    shouldReuseGlobalPrismaClient() &&
    globalForPrisma.prisma &&
    globalForPrisma.prismaConnectionString === connectionString
  ) {
    return globalForPrisma.prisma as TClient
  }

  const client = createClient(connectionString)
  if (shouldReuseGlobalPrismaClient()) {
    globalForPrisma.prisma = client
    globalForPrisma.prismaConnectionString = connectionString
  }
  return client
}

export function createPrismaProxy<TClient extends object>(getClient: () => TClient): TClient {
  return new Proxy({} as TClient, {
    get(_target, prop, receiver) {
      const client = getClient()
      const value = Reflect.get(client, prop, receiver)
      return typeof value === "function" ? value.bind(client) : value
    },
  })
}
