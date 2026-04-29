import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createPgPool(): Pool {
  if (globalForPrisma.pgPool) return globalForPrisma.pgPool;
  // Strip ?schema=public se houver — adapter-pg do Prisma 7 não suporta
  const raw = process.env.DATABASE_URL!;
  const url = raw.replace(/\?schema=public(&|$)/, "$1").replace(/[?&]$/, "");
  const pool = new Pool({
    connectionString: url,
    min: 1,
    max: 10,
    idleTimeoutMillis: 30_000,
    application_name: "nexus-insights",
  });
  if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;
  return pool;
}

function createPrismaClient() {
  const pool = createPgPool();
  // Schema "public" é o default do PrismaPg, configurar explicitamente
  const adapter = new PrismaPg(pool, { schema: "public" });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
