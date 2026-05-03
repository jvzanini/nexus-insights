import "server-only";

import { pgPool } from "@/lib/pg-pool";

/**
 * Garante que as tabelas multi-tenant `nexus_chat_connections` e
 * `company_chat_bindings` existem, e que `connection_id` (UUID, nullable)
 * está presente em todas as 6 tabelas pré-agregadas `chatwoot_facts_*`.
 *
 * Padrão deste projeto: este projeto NÃO roda `prisma migrate` em produção.
 * As mudanças DDL são aplicadas via `CREATE TABLE IF NOT EXISTS` /
 * `ALTER TABLE ADD COLUMN IF NOT EXISTS` chamados no boot do worker.
 *
 * Ordem de execução:
 *   1. CREATE nexus_chat_connections.
 *   2. CREATE company_chat_bindings (com FK → nexus_chat_connections).
 *   3. ALTER TABLE em cada uma das 6 tabelas chatwoot_facts_* adicionando
 *      connection_id UUID nullable.
 *   4. CREATE INDEX secundário (connection_id, account_id) em cada uma.
 *
 * NOT NULL + nova PK incluindo connection_id é responsabilidade do Lote 9
 * (após backfill validado em produção). Esta função é a fundação
 * deployable em paralelo ao código antigo.
 */

let ensured = false;
let inflight: Promise<void> | null = null;

const FACTS_TABLES = [
  "chatwoot_facts_daily_by_account",
  "chatwoot_facts_daily_by_inbox",
  "chatwoot_facts_daily_by_agent",
  "chatwoot_facts_daily_by_team",
  "chatwoot_facts_hourly_by_account",
  "chatwoot_facts_meta",
] as const;

const NEW_AUDIT_ENUM_VALUES = [
  "nexus_chat_connection_created",
  "nexus_chat_connection_updated",
  "nexus_chat_connection_deleted",
  "nexus_chat_connection_tested",
  "company_chat_binding_created",
  "company_chat_binding_updated",
  "company_chat_binding_deleted",
] as const;

async function createTables(): Promise<void> {
  // Adiciona valores novos ao enum AuditAction. Postgres exige ADD VALUE IF
  // NOT EXISTS dentro de transação implícita. Operação aditiva, segura.
  for (const v of NEW_AUDIT_ENUM_VALUES) {
    await pgPool.query(
      `ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${v}'`,
    );
  }

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "nexus_chat_connections" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "name" TEXT NOT NULL,
      "host" TEXT NOT NULL,
      "port" INTEGER NOT NULL DEFAULT 5432,
      "database" TEXT NOT NULL,
      "username" TEXT NOT NULL,
      "password_enc" TEXT NOT NULL,
      "ssl_mode" TEXT NOT NULL DEFAULT 'prefer',
      "application_name" TEXT NOT NULL DEFAULT 'nexus-insights',
      "webhook_token" TEXT,
      "webhook_secret_enc" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "last_test_at" TIMESTAMP(3),
      "last_test_error" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" TIMESTAMP(3),
      "created_by_id" UUID,
      CONSTRAINT "nexus_chat_connections_pkey" PRIMARY KEY ("id")
    );
  `);

  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "nexus_chat_connections_webhook_token_key"
      ON "nexus_chat_connections"("webhook_token");
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "nexus_chat_connections_status_deleted_at_idx"
      ON "nexus_chat_connections"("status", "deleted_at");
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "company_chat_bindings" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "connection_id" UUID NOT NULL,
      "chatwoot_account_id" INTEGER NOT NULL,
      "display_name" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "deleted_at" TIMESTAMP(3),
      "created_by_id" UUID,
      CONSTRAINT "company_chat_bindings_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "company_chat_bindings_connection_id_fkey"
        FOREIGN KEY ("connection_id")
        REFERENCES "nexus_chat_connections"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE
    );
  `);

  await pgPool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "company_chat_bindings_connection_id_chatwoot_account_id_key"
      ON "company_chat_bindings"("connection_id", "chatwoot_account_id");
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "company_chat_bindings_chatwoot_account_id_idx"
      ON "company_chat_bindings"("chatwoot_account_id");
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "company_chat_bindings_enabled_deleted_at_idx"
      ON "company_chat_bindings"("enabled", "deleted_at");
  `);

  for (const table of FACTS_TABLES) {
    await pgPool.query(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "connection_id" UUID;`,
    );
    await pgPool.query(
      `CREATE INDEX IF NOT EXISTS "${table}_connection_id_account_id_idx" ON "${table}"("connection_id", "account_id");`,
    );
  }
}

export async function ensureNexusChatTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      await createTables();
      ensured = true;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test helper — reseta cache. */
export function __resetEnsureNexusChatTablesCache(): void {
  ensured = false;
  inflight = null;
}
