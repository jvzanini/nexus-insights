-- v0.41.0 — Polling Delta migration: substitui webhook event-driven por polling delta universal
--
-- Mudanças:
--   1. ADD polling_interval_seconds + last_sync_at em nexus_chat_connections
--   2. CHECK constraint min 20s no polling_interval_seconds
--   3. CREATE TABLE chatwoot_sync_cursors (cursor por connection × account × tabela)
--   4. DELETE audit_logs com action webhook_* (cleanup batch antes de drop enum values)
--   5. DROP webhook_token, webhook_secret_enc, last_webhook_at de nexus_chat_connections
--   6. ALTER enum AuditAction: remove 6 valores webhook_* + add 5 valores polling_*
--
-- Ordem de execução: aditivos primeiro (1-3), depois cleanup (4), depois drops (5-6).
-- Migrations manuais idempotentes onde possível (IF EXISTS / IF NOT EXISTS).

-- ─── 1. ADD polling_interval_seconds + last_sync_at ───────────────────────
ALTER TABLE "nexus_chat_connections"
  ADD COLUMN IF NOT EXISTS "polling_interval_seconds" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "last_sync_at" TIMESTAMP(3) NULL;

-- ─── 2. CHECK constraint mínimo 20s ───────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "nexus_chat_connections"
    ADD CONSTRAINT "polling_interval_min_20s" CHECK ("polling_interval_seconds" >= 20);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. CREATE chatwoot_sync_cursors ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "chatwoot_sync_cursors" (
  "id"               UUID         PRIMARY KEY,
  "connection_id"    UUID         NOT NULL,
  "account_id"       INTEGER      NOT NULL,
  "table_name"       TEXT         NOT NULL,
  "last_synced_at"   TIMESTAMP(3) NULL,
  "last_synced_id"   BIGINT       NULL,
  "rows_synced"      BIGINT       NOT NULL DEFAULT 0,
  "last_run_ms"      INTEGER      NULL,
  "last_error"       TEXT         NULL,
  "last_error_at"    TIMESTAMP(3) NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices + FK
CREATE UNIQUE INDEX IF NOT EXISTS "chatwoot_sync_cursors_conn_acc_table_key"
  ON "chatwoot_sync_cursors"("connection_id", "account_id", "table_name");

CREATE INDEX IF NOT EXISTS "chatwoot_sync_cursors_conn_idx"
  ON "chatwoot_sync_cursors"("connection_id");

CREATE INDEX IF NOT EXISTS "chatwoot_sync_cursors_conn_acc_idx"
  ON "chatwoot_sync_cursors"("connection_id", "account_id");

DO $$ BEGIN
  ALTER TABLE "chatwoot_sync_cursors"
    ADD CONSTRAINT "chatwoot_sync_cursors_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "nexus_chat_connections"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 4. CLEANUP audit_logs com action webhook_* (batch para não travar lock) ──
DO $$
DECLARE
  rows_deleted INT;
BEGIN
  LOOP
    DELETE FROM "audit_logs"
    WHERE "id" IN (
      SELECT "id" FROM "audit_logs"
      WHERE "action"::text LIKE 'webhook_%'
      LIMIT 1000
    );
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;
    EXIT WHEN rows_deleted = 0;
  END LOOP;
END $$;

-- ─── 5. DROP webhook_token, webhook_secret_enc, last_webhook_at ───────────
DROP INDEX IF EXISTS "nexus_chat_connections_webhook_token_key";

ALTER TABLE "nexus_chat_connections"
  DROP COLUMN IF EXISTS "webhook_token",
  DROP COLUMN IF EXISTS "webhook_secret_enc",
  DROP COLUMN IF EXISTS "last_webhook_at";

-- ─── 6. ALTER enum AuditAction (estratégia Postgres: rename + create + alter + drop) ──
-- Postgres não suporta DROP VALUE em enum. Estratégia: rename antigo, criar novo
-- com valores desejados, ALTER TABLE para usar novo, drop antigo.

ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";

CREATE TYPE "AuditAction" AS ENUM (
  'login_succeeded',
  'login_failed',
  'password_reset_requested',
  'password_reset_completed',
  'user_created',
  'user_updated',
  'user_deleted',
  'user_role_changed',
  'user_access_granted',
  'user_access_revoked',
  'user_activated',
  'user_deactivated',
  'profile_updated',
  'profile_password_changed',
  'email_change_requested',
  'email_change_completed',
  'account_switched',
  'setting_updated',
  'opened_chatwoot_link',
  'session_revoked',
  'credential_created',
  'credential_updated',
  'credential_deleted',
  'credential_tested',
  'integration_profile_created',
  'integration_profile_updated',
  'integration_profile_deleted',
  'integration_password_revealed',
  'integration_password_rotated',
  'integration_provisioning_failed',
  'nexus_chat_connection_created',
  'nexus_chat_connection_updated',
  'nexus_chat_connection_deleted',
  'nexus_chat_connection_tested',
  'company_chat_binding_created',
  'company_chat_binding_updated',
  'company_chat_binding_deleted',
  'polling_sync_completed',
  'polling_sync_failed',
  'polling_full_sweep_started',
  'polling_full_sweep_completed',
  'polling_interval_updated'
);

ALTER TABLE "audit_logs"
  ALTER COLUMN "action" TYPE "AuditAction"
  USING "action"::text::"AuditAction";

DROP TYPE "AuditAction_old";
