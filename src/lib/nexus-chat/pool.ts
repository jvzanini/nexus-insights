// NÃO usar `import "server-only"` aqui: este módulo é importado pelo
// worker BullMQ (Node puro, fora do Next.js), onde o pacote `server-only`
// quebra com "Cannot find module".

import { Pool, type QueryResult } from "pg";
import { decrypt } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { ConnectionUnavailableError } from "./errors";

interface CachedPool {
  pool: Pool;
  snapshot: {
    name: string;
    host: string;
    port: number;
    database: string;
    status: string;
  };
  lastUsedAt: number;
}

const globalForPool = globalThis as unknown as {
  __nexusChatPools?: Map<string, CachedPool>;
  __nexusChatJanitor?: NodeJS.Timeout;
};

if (!globalForPool.__nexusChatPools) {
  globalForPool.__nexusChatPools = new Map<string, CachedPool>();
}

const pools = globalForPool.__nexusChatPools;

const IDLE_POOL_TTL_MS = 30 * 60_000;
const JANITOR_INTERVAL_MS = 10 * 60_000;

/**
 * Devolve (ou cria) o pool Postgres da `nexus_chat_connection` indicada.
 *
 * Cache: `Map<connectionId, { pool, snapshot, lastUsedAt }>`. Mantém o
 * snapshot da connection junto pra evitar refetch do Prisma em cada uso.
 *
 * Falha-fechada (`ConnectionUnavailableError`) se a connection foi soft-deletada
 * ou está com `status` != `active`.
 *
 * Janitor cross-process invalida pools idle por mais de 30 min — evita
 * memory leak quando muitas connections passam a existir. Para invalidação
 * cross-process imediata (edit/delete), o worker e o app escutam Pub/Sub
 * `connection:updated` / `connection:deleted` e chamam `invalidateNexusChatPool`.
 */
export async function getNexusChatPool(connectionId: string): Promise<Pool> {
  const existing = pools.get(connectionId);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.pool;
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: connectionId, deletedAt: null },
  });
  if (!conn || conn.status !== "active") {
    throw new ConnectionUnavailableError(connectionId, conn?.status ?? null);
  }

  const password = decrypt(conn.passwordEnc);
  const pool = new Pool({
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.username,
    password,
    // Mapping SSL modes:
    //   disable   → ssl: false (no-SSL, igual libpq sslmode=disable)
    //   prefer    → ssl: false (Node pg não tem fallback sslmode=prefer; banco
    //                         do Chatwoot atual não suporta SSL — usar false
    //                         como default conservador)
    //   require   → ssl: { rejectUnauthorized: false }
    //   verify-full → ssl: { rejectUnauthorized: true }
    ssl:
      conn.sslMode === "require"
        ? { rejectUnauthorized: false }
        : conn.sslMode === "verify-full"
          ? { rejectUnauthorized: true }
          : false,
    min: 0,
    max: 2,
    idleTimeoutMillis: 1_000,
    statement_timeout: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: conn.applicationName,
  });

  pool.on("error", (err) => {
    console.error(`[nexus-chat-pool ${conn.name}] error:`, err.message);
  });

  pools.set(connectionId, {
    pool,
    snapshot: {
      name: conn.name,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      status: conn.status,
    },
    lastUsedAt: Date.now(),
  });
  return pool;
}

/**
 * Fecha e remove o pool da connection do cache (best-effort no `pool.end()`).
 * Próximo uso refaz `findUnique` e recria. Chamado por:
 *   - Server Action de edit/delete da connection.
 *   - Listener Redis Pub/Sub do worker quando recebe `connection:updated/deleted`.
 *   - Janitor periódico para connections idle.
 */
export async function invalidateNexusChatPool(
  connectionId: string,
): Promise<void> {
  const cached = pools.get(connectionId);
  if (!cached) return;
  pools.delete(connectionId);
  await cached.pool.end().catch(() => {});
}

/**
 * Wrapper conveniente para `pool.query` — resolve o pool e executa a query.
 * Substitui `getChatwootPool().query(...)` em todos os call-sites.
 */
export async function queryNexusChat<T extends Record<string, unknown>>(
  connectionId: string,
  sql: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  const pool = await getNexusChatPool(connectionId);
  return pool.query<T>(sql, params);
}

if (!globalForPool.__nexusChatJanitor) {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [id, cached] of pools.entries()) {
      if (now - cached.lastUsedAt > IDLE_POOL_TTL_MS) {
        pools.delete(id);
        cached.pool.end().catch(() => {});
      }
    }
  }, JANITOR_INTERVAL_MS);
  // unref() permite que o processo termine mesmo se o timer estiver ativo
  // (importante em testes Jest e em workers que recebem SIGTERM).
  timer.unref?.();
  globalForPool.__nexusChatJanitor = timer;
}

/** Test helper — limpa pools cache (não usar em produção). */
export function __resetNexusChatPoolsForTests(): void {
  for (const [, cached] of pools.entries()) {
    cached.pool.end().catch(() => {});
  }
  pools.clear();
}
