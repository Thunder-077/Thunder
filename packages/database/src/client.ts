import { createRequire } from "module"
import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient as PGPrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prismaConnectionString: string | undefined
  prisma: any | undefined
}

function isSQLite(url?: string): boolean {
  return !!url && (url.startsWith("file:") || url.startsWith("sqlite:"))
}

function createPrismaClient(connectionString?: string): any {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (isSQLite(connectionString)) {
    let SQLitePrismaClient: any
    if (typeof require !== "undefined") {
      SQLitePrismaClient = require("./generated/sqlite-client/index.js").PrismaClient
    } else {
      const requireFn = createRequire(new Function("return import.meta.url")())
      SQLitePrismaClient = requireFn("./generated/sqlite-client/index.js").PrismaClient
    }
    return new SQLitePrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    })
  }

  const adapter = new PrismaNeon({ connectionString })
  return new PGPrismaClient({ adapter })
}

function resolveConnectionString(): string | undefined {
  return process.env.DATABASE_URL
}

function shouldReuseGlobalPrismaClient(): boolean {
  // Cloudflare Workers 会复用 isolate，但不允许把带 Native I/O 的对象跨请求复用。
  // 这里在 Worker 环境禁用全局 PrismaClient 复用，避免出现
  // “Cannot perform I/O on behalf of a different request”。
  return !("WebSocketPair" in globalThis)
}

export function getPrismaClient(): any {
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

export function createScopedPrismaClient(connectionString: string): any {
  return createPrismaClient(connectionString)
}

import { PrismaClient } from "@prisma/client"

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getPrismaClient()
    const value = Reflect.get(client, prop, receiver)
    return typeof value === "function" ? value.bind(client) : value
  },
})

export default prisma


