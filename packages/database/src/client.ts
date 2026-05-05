import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prismaConnectionString: string | undefined
  prisma: PrismaClient | undefined
}

function createPrismaClient(connectionString?: string): PrismaClient {
  if (!connectionString) {
    return new PrismaClient()
  }

  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({ adapter })
}

const connectionString = process.env.DATABASE_URL

export const prisma =
  globalForPrisma.prisma && globalForPrisma.prismaConnectionString === connectionString
    ? globalForPrisma.prisma
    : createPrismaClient(connectionString)

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
  globalForPrisma.prismaConnectionString = connectionString
}

export function createScopedPrismaClient(connectionString: string): PrismaClient {
  return createPrismaClient(connectionString)
}

export default prisma
