import { PrismaNeon } from "@prisma/adapter-neon"
import { PrismaClient as PGPrismaClient } from "@prisma/client"
import type { PrismaClient as PGPrismaClientType } from "@prisma/client"
import {
  createPrismaProxy,
  getCachedPrismaClient,
  isSQLiteConnectionString,
} from "./client-runtime"

function createPrismaClient(connectionString: string): PGPrismaClientType {
  if (isSQLiteConnectionString(connectionString)) {
    throw new Error("PostgreSQL Prisma client requires a PostgreSQL DATABASE_URL")
  }

  const adapter = new PrismaNeon({ connectionString })
  return new PGPrismaClient({ adapter })
}

export function getPrismaClient(): PGPrismaClientType {
  return getCachedPrismaClient(createPrismaClient)
}

export function createScopedPrismaClient(connectionString: string): PGPrismaClientType {
  return createPrismaClient(connectionString)
}

export const prisma = createPrismaProxy<PGPrismaClientType>(getPrismaClient)

export default prisma
