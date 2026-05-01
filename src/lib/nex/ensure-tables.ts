import "server-only";
import { pgPool } from "@/lib/pg-pool";

let ensured = false;
let inflight: Promise<void> | null = null;

async function createTables(): Promise<void> {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "nex_settings" (
      "id"                  TEXT NOT NULL DEFAULT 'global',
      "personality"         TEXT NOT NULL DEFAULT '',
      "tone"                TEXT NOT NULL DEFAULT '',
      "guardrails"          JSONB NOT NULL DEFAULT '[]'::jsonb,
      "advanced_override"   TEXT,
      "audio_input_enabled" BOOLEAN NOT NULL DEFAULT false,
      "kb_enabled"          BOOLEAN NOT NULL DEFAULT true,
      "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_by_id"       UUID,
      CONSTRAINT "nex_settings_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "nex_settings_singleton" CHECK (id = 'global')
    );
  `);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "nex_kb_documents" (
      "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
      "name"           TEXT NOT NULL,
      "mime_type"      TEXT NOT NULL,
      "file_size"      INTEGER NOT NULL,
      "char_count"     INTEGER NOT NULL,
      "extracted_text" TEXT NOT NULL,
      "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "uploaded_by_id" UUID,
      CONSTRAINT "nex_kb_documents_pkey" PRIMARY KEY ("id")
    );
  `);
  // v0.16.0: KB URL — `kind` (PDF/TXT/URL) + `source_url` aditivos.
  await pgPool.query(`
    ALTER TABLE "nex_kb_documents"
      ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PDF',
      ADD COLUMN IF NOT EXISTS "source_url" TEXT NULL;
  `);
  // v0.16.0: nex_settings.seeded_defaults_at + backfill condicional de guardrails default.
  await pgPool.query(`
    ALTER TABLE "nex_settings"
      ADD COLUMN IF NOT EXISTS "seeded_defaults_at" TIMESTAMPTZ NULL;
  `);
  // v0.16.0: chatwoot_account_urls (mapping account_id → URL pública para deep-links do Agente Nex).
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "chatwoot_account_urls" (
      "account_id"     INTEGER PRIMARY KEY,
      "public_url"     TEXT NOT NULL,
      "label"          TEXT NULL,
      "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updated_by_id"  UUID NULL
    );
  `);
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx" ON "nex_kb_documents"("created_at" DESC);`,
  );
  await pgPool.query(
    `INSERT INTO nex_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;`,
  );
  // v0.16.0: backfill condicional de guardrails default (apenas se nunca tocado).
  await pgPool.query(`
    UPDATE "nex_settings"
    SET "guardrails" = '[
      "Nunca exponha dados de uma conta diferente da ativa no contexto.",
      "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente.",
      "Sempre cite a fonte do número (qual relatório/tool e qual data de referência).",
      "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar.",
      "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
    ]'::jsonb,
    "seeded_defaults_at" = now()
    WHERE "id" = 'global'
      AND "seeded_defaults_at" IS NULL
      AND ("guardrails" IS NULL OR "guardrails" = '[]'::jsonb);
  `);
}

export async function ensureNexTables(): Promise<void> {
  if (ensured) return;
  if (inflight) return inflight;
  inflight = createTables()
    .then(() => {
      ensured = true;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function __resetEnsureNexTablesCache(): void {
  ensured = false;
  inflight = null;
}
