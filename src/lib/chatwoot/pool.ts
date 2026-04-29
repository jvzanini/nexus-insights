import { Pool, type QueryResult } from "pg";

/**
 * O usuário `chatwoot_leitura` tem CONNECTION LIMIT 5 no Postgres do Chatwoot.
 * Como app + worker compartilham o mesmo usuário, mantemos um pool MUITO pequeno
 * + queue serial para garantir que nunca abrimos mais que 1 conexão simultânea
 * de cada processo.
 *
 * Volume esperado: 30–50 acessos/dia. Serializar é totalmente aceitável.
 */

const globalForPool = globalThis as unknown as {
  chatwootPool: Pool | undefined;
  chatwootQueue: Promise<unknown> | undefined;
};

function createPool(): Pool {
  const pool = new Pool({
    connectionString: process.env.CHATWOOT_DATABASE_URL,
    min: 0,
    max: 2,
    idleTimeoutMillis: 1_000,
    statement_timeout: 30_000,
    connectionTimeoutMillis: 10_000,
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

/**
 * Executa SQL parametrizado no Chatwoot, serializado via queue global.
 * Nunca abre mais que 1 conexão simultânea — respeita CONNECTION LIMIT 5
 * mesmo quando home-summary chama 5 queries em Promise.all.
 */
export async function chatwootQuery<T>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const previous = globalForPool.chatwootQueue ?? Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Encadeia neste promise para que a próxima query aguarde esta acabar.
  globalForPool.chatwootQueue = previous.then(() => next).catch(() => {});

  await previous.catch(() => {});

  try {
    const pool = getChatwootPool();
    const client = await pool.connect();
    try {
      const result: QueryResult = await client.query(text, params as never[]);
      return result.rows as T[];
    } finally {
      client.release();
    }
  } finally {
    release();
  }
}
