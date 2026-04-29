import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __nexusPgPool: Pool | undefined;
}

export const pgPool: Pool =
  globalThis.__nexusPgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__nexusPgPool = pgPool;
}
