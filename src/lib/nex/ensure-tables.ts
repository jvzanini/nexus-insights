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
  await pgPool.query(
    `CREATE INDEX IF NOT EXISTS "nex_kb_documents_created_at_idx" ON "nex_kb_documents"("created_at" DESC);`,
  );
  await pgPool.query(
    `INSERT INTO nex_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;`,
  );
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
