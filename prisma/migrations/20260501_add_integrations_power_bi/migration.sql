-- v0.17.0 — Integrações: Power BI (IntegrationProfile + IntegrationAuditLog + schema isolado powerbi)

-- ───────────────────────────────────────────────────────────────────────
-- 1. Enums novos
-- ───────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "IntegrationKind" AS ENUM ('power_bi');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationProfileStatus" AS ENUM ('active', 'disabled', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "IntegrationAuditEvent" AS ENUM (
    'profile_created',
    'profile_updated',
    'profile_disabled',
    'profile_reactivated',
    'profile_deleted',
    'password_revealed',
    'password_rotated',
    'whitelist_changed',
    'provisioning_failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 2. AuditAction: 6 valores adicionais
-- ───────────────────────────────────────────────────────────────────────

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_profile_created';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_profile_updated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_profile_deleted';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_password_revealed';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_password_rotated';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'integration_provisioning_failed';

-- ───────────────────────────────────────────────────────────────────────
-- 3. Tabelas
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "integration_profiles" (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind"                   "IntegrationKind" NOT NULL,
  "name"                   TEXT NOT NULL,
  "description"            TEXT NULL,
  "status"                 "IntegrationProfileStatus" NOT NULL DEFAULT 'active',
  "pg_username"            TEXT NOT NULL UNIQUE,
  "encrypted_pg_password"  TEXT NOT NULL,
  "password_last4"         TEXT NOT NULL,
  "allowed_tables"         JSONB NOT NULL,
  "allowed_columns"        JSONB NOT NULL,
  "account_id_filter"      JSONB NULL,
  "team_id_filter"         JSONB NULL,
  "last_provisioned_at"    TIMESTAMPTZ NULL,
  "last_provision_error"   TEXT NULL,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "created_by_id"          UUID NULL,
  "disabled_at"            TIMESTAMPTZ NULL,
  "deleted_at"             TIMESTAMPTZ NULL,
  CONSTRAINT "integration_profiles_created_by_fk" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "integration_profiles_kind_status_idx"
  ON "integration_profiles" ("kind", "status");
CREATE INDEX IF NOT EXISTS "integration_profiles_deleted_at_idx"
  ON "integration_profiles" ("deleted_at");

CREATE TABLE IF NOT EXISTS "integration_audit_logs" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "profile_id"  UUID NOT NULL,
  "event"       "IntegrationAuditEvent" NOT NULL,
  "user_id"     UUID NULL,
  "details"     JSONB NULL,
  "ip_address"  TEXT NULL,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "integration_audit_logs_profile_fk" FOREIGN KEY ("profile_id") REFERENCES "integration_profiles"("id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "integration_audit_logs_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "integration_audit_logs_profile_created_idx"
  ON "integration_audit_logs" ("profile_id", "created_at" DESC);

-- ───────────────────────────────────────────────────────────────────────
-- Schema isolado powerbi (Power BI integration)
-- ───────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS powerbi;

-- Snapshot tables
CREATE TABLE IF NOT EXISTS powerbi.dim_accounts_snapshot (
  account_id INT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS powerbi.dim_inboxes_snapshot (
  account_id INT NOT NULL,
  inbox_id INT NOT NULL,
  name TEXT NOT NULL,
  channel_type TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, inbox_id)
);
CREATE TABLE IF NOT EXISTS powerbi.dim_agents_snapshot (
  account_id INT NOT NULL,
  agent_id INT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, agent_id)
);
CREATE TABLE IF NOT EXISTS powerbi.dim_teams_snapshot (
  account_id INT NOT NULL,
  team_id INT NOT NULL,
  name TEXT NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, team_id)
);

-- Passthrough views (dims)
CREATE OR REPLACE VIEW powerbi.dim_accounts AS
  SELECT account_id, name, status FROM powerbi.dim_accounts_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_inboxes AS
  SELECT account_id, inbox_id, name, channel_type FROM powerbi.dim_inboxes_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_agents AS
  SELECT account_id, agent_id, name, email FROM powerbi.dim_agents_snapshot;
CREATE OR REPLACE VIEW powerbi.dim_teams AS
  SELECT account_id, team_id, name FROM powerbi.dim_teams_snapshot;

-- Passthrough views (facts)
CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_account AS
  SELECT account_id, bucket_date, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
  FROM public.chatwoot_facts_daily_by_account;
CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_inbox AS
  SELECT account_id, bucket_date, inbox_id, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
  FROM public.chatwoot_facts_daily_by_inbox;
CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_agent AS
  SELECT account_id, bucket_date, agent_id, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds, is_active_at_eod
  FROM public.chatwoot_facts_daily_by_agent;
CREATE OR REPLACE VIEW powerbi.chatwoot_facts_daily_by_team AS
  SELECT account_id, bucket_date, team_id, received, resolved, open_at_eod, pending_at_eod,
         messages_in, messages_out, unique_contacts,
         frt_p50_seconds, frt_p90_seconds, rt_p50_seconds
  FROM public.chatwoot_facts_daily_by_team;
CREATE OR REPLACE VIEW powerbi.chatwoot_facts_hourly_by_account AS
  SELECT account_id, bucket_date, bucket_hour, received, resolved,
         messages_in, messages_out, unique_contacts
  FROM public.chatwoot_facts_hourly_by_account;

-- Calendar
CREATE OR REPLACE VIEW powerbi.dim_dates AS
  SELECT
    d::DATE AS bucket_date,
    EXTRACT(YEAR FROM d)::INT AS year,
    EXTRACT(MONTH FROM d)::INT AS month,
    EXTRACT(DAY FROM d)::INT AS day,
    EXTRACT(DOW FROM d)::INT AS day_of_week,
    EXTRACT(WEEK FROM d)::INT AS iso_week,
    TO_CHAR(d, 'TMMonth') AS month_name_pt
  FROM generate_series('2024-01-01'::DATE, '2030-12-31'::DATE, '1 day') AS d;

-- Comments
COMMENT ON SCHEMA powerbi IS 'Power BI integration: 1 view per (profile, exposed table). Managed by app, do not edit manually.';
COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_account IS 'v1 (2026-05-01)';
COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_inbox IS 'v1 (2026-05-01)';
COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_agent IS 'v1 (2026-05-01)';
COMMENT ON VIEW powerbi.chatwoot_facts_daily_by_team IS 'v1 (2026-05-01)';
COMMENT ON VIEW powerbi.chatwoot_facts_hourly_by_account IS 'v1 (2026-05-01)';
