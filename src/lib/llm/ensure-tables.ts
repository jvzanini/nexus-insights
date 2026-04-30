import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { decrypt } from "@/lib/encryption";

/**
 * Garante que as tabelas `llm_configs`, `llm_usage` e `llm_credentials` existem.
 *
 * Estratégia prática: este projeto não roda `prisma migrate` em produção,
 * então criamos as tabelas via `CREATE TABLE IF NOT EXISTS` na primeira
 * chamada e cacheamos o resultado para evitar custo em chamadas seguintes.
 *
 * Em v0.12.0:
 * - Adiciona tabela `llm_credentials` (chaves de API rotuladas).
 * - Adiciona coluna `credential_id` em `llm_configs` (FK lógica para
 *   `llm_credentials`).
 * - Torna `llm_configs.encrypted_api_key` NULLABLE (a chave passa a viver em
 *   `llm_credentials`; mantemos a coluna por compat de rollback).
 * - Adiciona colunas `cost_brl` e `usd_to_brl_rate` em `llm_usage`.
 * - Migração one-shot: para cada `llm_configs` com chave existente cria uma
 *   credencial "Chave principal" e popula `credential_id`.
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

  // --- Novo em v0.12.0: tabela de credenciais ---
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "llm_credentials" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "provider" TEXT NOT NULL,
      "label" TEXT NOT NULL,
      "encrypted_api_key" TEXT NOT NULL,
      "last4" TEXT NOT NULL,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by_id" UUID,
      CONSTRAINT "llm_credentials_pkey" PRIMARY KEY ("id")
    );
  `);
  await pgPool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "llm_credentials_provider_label_idx" ON "llm_credentials"("provider", "label");`,
  );
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "llm_credentials_provider_updated_idx" ON "llm_credentials"("provider", "updated_at" DESC);`,
  );

  // --- Novo em v0.12.0: colunas em llm_configs e llm_usage ---
  await pgPool.query(
    `ALTER TABLE "llm_configs" ADD COLUMN IF NOT EXISTS "credential_id" UUID;`,
  );
  await pgPool.query(
    `ALTER TABLE "llm_configs" ALTER COLUMN "encrypted_api_key" DROP NOT NULL;`,
  );
  await pgPool.query(
    `ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "cost_brl" DECIMAL(12,6);`,
  );
  await pgPool.query(
    `ALTER TABLE "llm_usage" ADD COLUMN IF NOT EXISTS "usd_to_brl_rate" DECIMAL(10,4);`,
  );

  // --- Novo em v0.12.0: novos valores no enum AuditAction ---
  // ADD VALUE IF NOT EXISTS é idempotente; o cast COMMIT do enum acontece
  // automaticamente no transaction-less ALTER TYPE.
  for (const value of [
    "credential_created",
    "credential_updated",
    "credential_deleted",
    "credential_tested",
  ]) {
    await pgPool.query(
      `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${value}';`,
    );
  }
}

async function migrateExistingConfigs(): Promise<void> {
  const pending = await pgPool.query<{
    id: string;
    provider: string;
    encrypted_api_key: string;
  }>(
    `SELECT id, provider, encrypted_api_key
       FROM llm_configs
      WHERE credential_id IS NULL
        AND encrypted_api_key IS NOT NULL`,
  );

  for (const row of pending.rows) {
    let last4: string;
    try {
      last4 = decrypt(row.encrypted_api_key).slice(-4);
    } catch (err) {
      console.warn(
        `[ensureLlmTables] decrypt falhou na config ${row.id}; pulando.`,
        err,
      );
      continue;
    }

    // Gera label "Chave principal" único pelo provider.
    let label = "Chave principal";
    let suffix = 1;
    while (true) {
      const existing = await pgPool.query<{ count: string | number }>(
        `SELECT COUNT(*) AS count FROM llm_credentials WHERE provider = $1 AND label = $2`,
        [row.provider, label],
      );
      if (Number(existing.rows[0]?.count ?? 0) === 0) break;
      suffix += 1;
      label = `Chave principal ${suffix}`;
    }

    const inserted = await pgPool.query<{ id: string }>(
      `INSERT INTO llm_credentials (id, provider, label, encrypted_api_key, last4, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [row.provider, label, row.encrypted_api_key, last4],
    );

    await pgPool.query(
      `UPDATE llm_configs SET credential_id = $1 WHERE id = $2`,
      [inserted.rows[0].id, row.id],
    );
  }
}

export async function ensureLlmTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = (async () => {
    await createTables();
    await migrateExistingConfigs();
  })()
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
