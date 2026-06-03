import { PrismaClient as SQLitePrismaClient } from "./generated/sqlite-client/index.js"
import type { PrismaClient as SQLitePrismaClientType } from "./generated/sqlite-client"
import {
  createPrismaProxy,
  getCachedPrismaClient,
  isSQLiteConnectionString,
} from "./client-runtime"

function createPrismaClient(connectionString: string): SQLitePrismaClientType {
  if (!isSQLiteConnectionString(connectionString)) {
    throw new Error("SQLite Prisma client requires a file: or sqlite: DATABASE_URL")
  }

  return new SQLitePrismaClient({
    datasources: {
      db: {
        url: connectionString,
      },
    },
  }) as SQLitePrismaClientType
}

export function getPrismaClient(): SQLitePrismaClientType {
  return getCachedPrismaClient(createPrismaClient)
}

export function createScopedPrismaClient(connectionString: string): SQLitePrismaClientType {
  return createPrismaClient(connectionString)
}

export const prisma = createPrismaProxy<SQLitePrismaClientType>(getPrismaClient)

export default prisma
