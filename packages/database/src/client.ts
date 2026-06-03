import { createRequire } from "module"
import type { PrismaClient } from "@prisma/client"
import {
  createPrismaProxy,
  getCachedPrismaClient,
  isSQLiteConnectionString,
} from "./client-runtime"

const requireFn =
  typeof require !== "undefined"
    ? require
    : createRequire(new Function("return import.meta.url")())

function createPrismaClient(connectionString?: string): any {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured")
  }

  if (isSQLiteConnectionString(connectionString)) {
    const SQLitePrismaClient = requireFn("./generated/sqlite-client/index.js").PrismaClient
    return new SQLitePrismaClient({
      datasources: {
        db: {
          url: connectionString,
        },
      },
    })
  }

  const { PrismaNeon } = requireFn("@prisma/adapter-neon")
  const { PrismaClient: PGPrismaClient } = requireFn("@prisma/client")
  const adapter = new PrismaNeon({ connectionString })
  return new PGPrismaClient({ adapter })
}

export function getPrismaClient(): any {
  return getCachedPrismaClient(createPrismaClient)
}

export function createScopedPrismaClient(connectionString: string): any {
  return createPrismaClient(connectionString)
}

export const prisma = createPrismaProxy<PrismaClient>(getPrismaClient)

export default prisma

