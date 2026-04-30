import "server-only";

import { pgPool } from "@/lib/pg-pool";

/**
 * Garante que as tabelas `llm_configs` e `llm_usage` existem.
 *
 * Estratégia prática: este projeto não roda `prisma migrate` em produção,
 * então criamos as tabelas via `CREATE TABLE IF NOT EXISTS` na primeira
 * chamada e cacheamos o resultado para evitar custo em chamadas seguintes.
 */

let ensured = false;
let inflight: Promise<void> | null = null;

async function createTables(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_configs" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "encrypted_api_key" TEXT NOT NULL,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by_id" UUID,
      CONSTRAINT "llm_configs_pkey" PRIMARY KEY ("id")
    );
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_usage" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "model" TEXT NOT NULL,
      "tokens_input" INTEGER NOT NULL,
      "tokens_output" INTEGER NOT NULL,
      "cost_usd" DECIMAL(10,6) NOT NULL,
      "prompt_chars" INTEGER NOT NULL,
      "response_chars" INTEGER NOT NULL,
      "user_id" UUID,
      "duration_ms" INTEGER,
      "error_message" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
    );
  `);

  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_usage_created_at_idx" ON "llm_usage"("created_at");`,
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_usage_provider_model_created_at_idx" ON "llm_usage"("provider", "model", "created_at");`,
  );
}

export async function ensureLlmTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = createTables()
    .then(() => {
      ensured = true;
    })
    .catch((err) => {
      // Não cacheia falha — permite retry na próxima chamada.
      inflight = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Apenas para testes — força rebuild do cache em memória. */
export function __resetEnsureLlmTablesCache(): void {
  ensured = false;
  inflight = null;
}
