import { Pool } from "pg";

const globalForPool = globalThis as unknown as {
  chatwootPool: Pool | undefined;
};

export function getChatwootPool(): Pool {
  if (globalForPool.chatwootPool) return globalForPool.chatwootPool;
  // Connection limit do usuário read-only é restrito (5 conexões).
  // Mantemos pool mínimo e fechamos rápido para não estourar.
  const pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 0,
    max: 3,
    idleTimeoutMillis: 5_000,
    statement_timeout: 30_000,
    application_name: "nexus-insights",
  });
  pool.on("error", (err) => {
    console.error("[chatwoot-pool] error:", err);
  });
  globalForPool.chatwootPool = pool;
  return pool;
}

export async function chatwootQuery<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getChatwootPool().query(text, params as never[]);
  return result.rows as T[];
}
