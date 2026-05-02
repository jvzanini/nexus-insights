import "server-only";
import { pgPool } from "@/lib/pg-pool";

/**
 * Garante (CREATE IF NOT EXISTS) as estruturas de Integrações Power BI:
 * - enums IntegrationKind, IntegrationProfileStatus, IntegrationAuditEvent
 * - tabela integration_profiles
 * - tabela integration_audit_logs
 * - schema isolado powerbi (snapshots + views passthrough)
 * - 6 valores adicionais no enum AuditAction
 *
 * Idempotente. Pattern alinhado com src/lib/llm/ensure-tables.ts e
 * src/lib/nex/ensure-tables.ts (executado on-demand pelas Server Actions
 * pra não depender de Prisma migrate em produção).
 */

let ensured = false;
let inflight: Promise<void> | null = null;

async function createEnums(): Promise<void> {
  await pgPool.query(`
    DO $$ BEGIN
      CREATE TYPE "IntegrationKind" AS ENUM ('power_bi');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgPool.query(`
    DO $$ BEGIN
      CREATE TYPE "IntegrationProfileStatus" AS ENUM ('active', 'disabled', 'error');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
  await pgPool.query(`
    DO $$ BEGIN
      CREATE TYPE "IntegrationAuditEvent" AS ENUM (
        'profile_created','profile_updated','profile_disabled','profile_reactivated',
        'profile_deleted','password_revealed','password_rotated','whitelist_changed',
        'provisioning_failed'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}

async function addAuditActionValues(): Promise<void> {
  const values = [
    "integration_profile_created",
    "integration_profile_updated",
    "integration_profile_deleted",
    "integration_password_revealed",
    "integration_password_rotated",
    "integration_provisioning_failed",
  ];
  for (const v of values) {
    await pgPool.query(`ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS '${v}'`);
  }
}

async function createTables(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "integration_profiles" (
      "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
      "kind"                  "IntegrationKind" NOT NULL,
      "name"                  TEXT NOT NULL,
      "description"           TEXT,
      "status"                "IntegrationProfileStatus" NOT NULL DEFAULT 'active',
      "pg_username"           TEXT NOT NULL,
      "encrypted_pg_password" TEXT NOT NULL,
      "password_last4"        TEXT NOT NULL,
      "allowed_tables"        JSONB NOT NULL,
      "allowed_columns"       JSONB NOT NULL,
      "account_id_filter"     JSONB,
      "team_id_filter"        JSONB,
      "last_provisioned_at"   TIMESTAMP(3),
      "last_provision_error"  TEXT,
      "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "created_by_id"         UUID,
      "disabled_at"           TIMESTAMP(3),
      "deleted_at"            TIMESTAMP(3),
      CONSTRAINT "integration_profiles_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "integration_profiles_pg_username_key" UNIQUE ("pg_username")
    );
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "integration_profiles_kind_status_idx"
      ON "integration_profiles" ("kind", "status");
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "integration_profiles_deleted_at_idx"
      ON "integration_profiles" ("deleted_at");
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "integration_audit_logs" (
      "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
      "profile_id" UUID NOT NULL,
      "event"      "IntegrationAuditEvent" NOT NULL,
      "user_id"    UUID,
      "details"    JSONB,
      "ip_address" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "integration_audit_logs_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "integration_audit_logs_profile_id_fkey"
        FOREIGN KEY ("profile_id") REFERENCES "integration_profiles" ("id")
        ON DELETE NO ACTION ON UPDATE CASCADE
    );
  `);
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "integration_audit_logs_profile_id_created_at_idx"
      ON "integration_audit_logs" ("profile_id", "created_at" DESC);
  `);

  // Trigger pra auto-update do updated_at em integration_profiles
  await pgPool.query(`
    CREATE OR REPLACE FUNCTION integration_profiles_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
  await pgPool.query(`
    DO $$ BEGIN
      CREATE TRIGGER integration_profiles_updated_at
        BEFORE UPDATE ON integration_profiles
        FOR EACH ROW EXECUTE FUNCTION integration_profiles_set_updated_at();
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `);
}

async function createPowerbiSchema(): Promise<void> {
  await pgPool.query(`CREATE SCHEMA IF NOT EXISTS powerbi`);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
      account_id INT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS powerbi.dim_inboxes_snapshot (
      account_id INT NOT NULL,
      inbox_id INT NOT NULL,
      name TEXT NOT NULL,
      channel_type TEXT,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (account_id, inbox_id)
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS powerbi.dim_agents_snapshot (
      account_id INT NOT NULL,
      agent_id INT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (account_id, agent_id)
    )
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS powerbi.dim_teams_snapshot (
      account_id INT NOT NULL,
      team_id INT NOT NULL,
      name TEXT NOT NULL,
      refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (account_id, team_id)
    )
  `);

  // Views passthrough (dims)
  await pgPool.query(`
    CREATE OR REPLACE VIEW powerbi.dim_accounts AS
      SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot
  `);
  await pgPool.query(`
    CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
      SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot
  `);
  await pgPool.query(`
    CREATE OR REPLACE VIEW powerbi.dim_agents AS
      SELECT account_id, agent_id, name, email FROM powerbi.dim_agents_snapshot
  `);
  await pgPool.query(`
    CREATE OR REPLACE VIEW powerbi.dim_teams AS
      SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot
  `);

  // Views passthrough (facts) — só criadas se as tabelas-fonte existirem
  const factViews: Array<[string, string]> = [
    ["chatwoot_facts_daily_by_account", "account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod, messages_in, messages_out, unique_contacts, frt_p50_seconds, frt_p90_seconds, rt_p50_seconds"],
    ["chatwoot_facts_daily_by_inbox",   "account_id, bucket_date, inbox_id, received, resolved, open_at_eod, pending_at_eod, messages_in, messages_out, unique_contacts, frt_p50_seconds, frt_p90_seconds, rt_p50_seconds"],
    ["chatwoot_facts_daily_by_agent",   "account_id, bucket_date, agent_id, received, resolved, open_at_eod, pending_at_eod, messages_in, messages_out, unique_contacts, frt_p50_seconds, frt_p90_seconds, rt_p50_seconds, is_active_at_eod"],
    ["chatwoot_facts_daily_by_team",    "account_id, bucket_date, team_id, received, resolved, open_at_eod, pending_at_eod, messages_in, messages_out, unique_contacts, frt_p50_seconds, frt_p90_seconds, rt_p50_seconds"],
    ["chatwoot_facts_hourly_by_account","account_id, bucket_date, bucket_hour, received, resolved, messages_in, messages_out, unique_contacts"],
  ];
  for (const [name, cols] of factViews) {
    try {
      await pgPool.query(
        `CREATE OR REPLACE VIEW powerbi.${name} AS SELECT ${cols} FROM public.${name}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[integrations.ensure-tables] view powerbi.${name} pulada: ${msg}`);
    }
  }

  await pgPool.query(`
    CREATE OR REPLACE VIEW powerbi.dim_dates AS
      SELECT
        d::DATE AS bucket_date,
        EXTRACT(YEAR FROM d)::INT AS year,
        EXTRACT(MONTH FROM d)::INT AS month,
        EXTRACT(DAY FROM d)::INT AS day,
        EXTRACT(DOW FROM d)::INT AS day_of_week,
        EXTRACT(WEEK FROM d)::INT AS iso_week,
        TO_CHAR(d, 'TMMonth') AS month_name_pt
      FROM generate_series('2024-01-01'::DATE, '2030-12-31'::DATE, '1 day') AS d
  `);
}

export async function ensureIntegrationsTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = (async () => {
    await createEnums();
    await addAuditActionValues();
    await createTables();
    await createPowerbiSchema();
    ensured = true;
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}
