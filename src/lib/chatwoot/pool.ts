import { Pool, type QueryResult } from "pg";

/**
 * Pool read-only para o banco do Chatwoot (role `chatwoot_leitura`).
 *
 * CONNECTION LIMIT do role no Postgres é 5. Este pool (app) + pool do worker
 * compartilham o mesmo role, por isso max=1 por processo:
 *   app:    1 conexão
 *   worker: 1 conexão
 *   total:  2 ≤ 5 ✓
 *
 * max=1 delega a serialização ao pg.Pool interno, eliminando a necessidade
 * de queue manual (que tinha race condition sob carga concorrente).
 * Retry com jitter previne thundering herd quando o banco rejeita 53300.
 */

const globalForPool = globalThis as unknown as {
  chatwootPool: Pool | undefined;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 0,
    max: 1,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    connectionTimeoutMillis: 15_000,
    application_name: "nexus-insights",
  });
  pool.on("error", (err) => {
    console.error("[chatwoot-pool] error:", err.message);
  });
  return pool;
}

export function getChatwootPool(): Pool {
  if (globalForPool.chatwootPool) return globalForPool.chatwootPool;
  globalForPool.chatwootPool = createPool();
  return globalForPool.chatwootPool;
}

const RETRYABLE_PG_CODES = new Set(["53300", "53200", "08006", "08001", "08P01"]);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code ?? "";
      if (!RETRYABLE_PG_CODES.has(code)) throw err;
      if (attempt < maxAttempts - 1) {
        const jitter = Math.random() * 150;
        await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + jitter));
      }
    }
  }
  throw lastErr;
}

/**
 * Executa SQL parametrizado no Chatwoot com retry automático para erros
 * de conexão (53300 = too_many_connections, 08006 = connection_failure, etc.).
 */
export async function chatwootQuery<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withRetry(async () => {
    const pool = getChatwootPool();
    const result: QueryResult = await pool.query(text, params as never[]);
    return result.rows as T[];
  });
}
