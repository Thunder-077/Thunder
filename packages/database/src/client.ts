import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prismaConnectionString: string | undefined
  prisma: PrismaClient | undefined
}

function createPrismaClient(connectionString?: string): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured for Prisma Neon adapter")
  }

  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({ adapter })
}

function resolveConnectionString(): string | undefined {
  return process.env.DATABASE_URL
}

function shouldReuseGlobalPrismaClient(): boolean {
  // Cloudflare Workers 会复用 isolate，但不允许把带 Native I/O 的对象跨请求复用。
  // 这里在 Worker 环境禁用全局 PrismaClient 复用，避免出现
  // “Cannot perform I/O on behalf of a different request”。
  return typeof WebSocketPair === "undefined"
}

export function getPrismaClient(): PrismaClient {
  const connectionString = resolveConnectionString()
  if (
    shouldReuseGlobalPrismaClient() &&
    globalForPrisma.prisma &&
    globalForPrisma.prismaConnectionString === connectionString
  ) {
    return globalForPrisma.prisma
  }

  const client = createPrismaClient(connectionString)
  if (shouldReuseGlobalPrismaClient()) {
    globalForPrisma.prisma = client
    globalForPrisma.prismaConnectionString = connectionString
  }
  return client
}

export function createScopedPrismaClient(connectionString: string): PrismaClient {
  return createPrismaClient(connectionString)
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
})

export default prisma
