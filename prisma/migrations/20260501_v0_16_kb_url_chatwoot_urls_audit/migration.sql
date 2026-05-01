-- v0.16.0 — KB URLs + ChatwootAccountUrl + NexSettings.seeded_defaults_at + guardrails default backfill

-- 1. NexKbDocument: kind enum + source_url (aditivo)
ALTER TABLE "nex_kb_documents"
  ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'PDF',
  ADD COLUMN IF NOT EXISTS "source_url" TEXT NULL;

-- 2. NexSettings: seeded_defaults_at (aditivo)
ALTER TABLE "nex_settings"
  ADD COLUMN IF NOT EXISTS "seeded_defaults_at" TIMESTAMPTZ NULL;

-- 3. ChatwootAccountUrl (novo)
CREATE TABLE IF NOT EXISTS "chatwoot_account_urls" (
  "account_id"     INTEGER PRIMARY KEY,
  "public_url"     TEXT NOT NULL,
  "label"          TEXT NULL,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_by_id"  UUID NULL
);

-- 4. Backfill condicional dos guardrails default (só se nunca tocado E array vazio)
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

-- 5. Garantir singleton row em nex_settings (caso não exista, cria com defaults vazios + seeded marker)
INSERT INTO "nex_settings" ("id", "personality", "tone", "guardrails", "audio_input_enabled", "kb_enabled", "seeded_defaults_at", "updated_at")
VALUES (
  'global',
  '',
  '',
  '[
    "Nunca exponha dados de uma conta diferente da ativa no contexto.",
    "Nunca compartilhe API keys, tokens, secrets, IDs internos ou variáveis de ambiente.",
    "Sempre cite a fonte do número (qual relatório/tool e qual data de referência).",
    "Se um número parecer impossível ou inconsistente, alerte o usuário antes de afirmar.",
    "Não execute, sugira ou simule ações destrutivas (apagar conversas, mudar config sem confirmação, mexer em produção)."
  ]'::jsonb,
  false,
  true,
  now(),
  now()
)
ON CONFLICT ("id") DO NOTHING;
