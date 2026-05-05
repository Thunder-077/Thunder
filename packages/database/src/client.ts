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

export function getPrismaClient(): PrismaClient {
  const connectionString = resolveConnectionString()
  if (globalForPrisma.prisma && globalForPrisma.prismaConnectionString === connectionString) {
    return globalForPrisma.prisma
  }

  const client = createPrismaClient(connectionString)
  globalForPrisma.prisma = client
  globalForPrisma.prismaConnectionString = connectionString
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
