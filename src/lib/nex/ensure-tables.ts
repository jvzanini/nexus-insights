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
  // v0.26.0: column flag pra backfill idempotente do seed v2 dos guardrails.
  await pgPool.query(`
    ALTER TABLE "nex_settings"
      ADD COLUMN IF NOT EXISTS "seeded_v2_at" TIMESTAMPTZ NULL;
  `);
  // v0.28.0: identity_base column — NULL = usa default hardcoded em prompt-compose.ts
  await pgPool.query(`
    ALTER TABLE "nex_settings"
      ADD COLUMN IF NOT EXISTS "identity_base" TEXT NULL;
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
  // v0.26.0: seed novo SEM "Sempre cite a fonte do número" — backfill condicional pra installs novos.
  await pgPool.query(`
    UPDATE "nex_settings"
    SET "guardrails" = '[
      "Nunca exponha dados de uma conta diferente da ativa no contexto.",
      "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente.",
      "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar.",
      "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
    ]'::jsonb,
    "seeded_defaults_at" = COALESCE("seeded_defaults_at", now())
    WHERE "id" = 'global'
      AND "seeded_defaults_at" IS NULL
      AND ("guardrails" IS NULL OR "guardrails" = '[]'::jsonb);
  `);
  // v0.26.0: backfill — remove guardrail "Sempre cite a fonte do número..." de
  // installs antigos. Match EXATO do texto do seed antigo (preserva guardrails
  // customizados que mencionem "cite a fonte" em outro contexto). Idempotente
  // via seeded_v2_at — só roda 1 vez por install.
  await pgPool.query(`
    UPDATE "nex_settings"
    SET guardrails = COALESCE(
      (SELECT jsonb_agg(elem)
       FROM jsonb_array_elements(guardrails) AS elem
       WHERE elem::text NOT ILIKE '%cite a fonte do número%'),
      '[]'::jsonb
    ),
    seeded_v2_at = now()
    WHERE id = 'global'
      AND seeded_v2_at IS NULL;
  `);
  // v0.20.0: backfill condicional de Personality e Tom default (apenas se já houve
  // seed de guardrails E ambos campos estão vazios — não sobrescreve customizações).
  await pgPool.query(`
    UPDATE "nex_settings"
    SET "personality" = 'Direto, prático, prefere bullets curtos quando há listas. Evita rodeios e textão. Não se apresenta a cada turno.',
        "tone" = 'Profissional e objetivo, em pt-BR. Usa "você". Sem se desculpar; sem repetir o nome do agente.'
    WHERE "id" = 'global'
      AND "seeded_defaults_at" IS NOT NULL
      AND "personality" = '' AND "tone" = '';
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
