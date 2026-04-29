import { Pool } from "pg";

let pool: Pool | null = null;

export function getChatwootPool(): Pool {
  if (pool) return pool;
  pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 2,
    max: 8,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    application_name: "nexus-insights",
  });
  pool.on("error", (err) => {
    console.error("[chatwoot-pool] error:", err);
  });
  return pool;
}

export async function chatwootQuery<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getChatwootPool().query(text, params as never[]);
  return result.rows as T[];
}
