import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { decrypt } from "@/lib/encryption";

import { ensureLlmTables } from "./ensure-tables";
import type { LlmProvider } from "./types";

export interface ActiveLlmConfig {
  id: string;
  provider: LlmProvider;
  model: string;
  /** API key descriptografada — manter em memória, nunca expor pela rede. */
  apiKey: string;
  credentialId: string | null;
  credentialLabel: string | null;
}

const VALID_PROVIDERS = new Set<LlmProvider>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);

interface JoinedRow {
  id: string;
  provider: string;
  model: string;
  encrypted_api_key: string | null;
  credential_id: string | null;
  label: string | null;
  last4: string | null;
  legacy_encrypted_api_key: string | null;
}

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  await ensureLlmTables();
  const result = await pgPool.query<JoinedRow>(
    `SELECT cfg.id,
            cfg.provider,
            cfg.model,
            cred.encrypted_api_key AS encrypted_api_key,
            cfg.credential_id AS credential_id,
            cred.label AS label,
            cred.last4 AS last4,
            cfg.encrypted_api_key AS legacy_encrypted_api_key
       FROM llm_configs cfg
  LEFT JOIN llm_credentials cred ON cred.id = cfg.credential_id
      WHERE cfg.is_active = true
   ORDER BY cfg.updated_at DESC
      LIMIT 1`,
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];

  if (!VALID_PROVIDERS.has(row.provider as LlmProvider)) return null;

  const encrypted = row.encrypted_api_key ?? row.legacy_encrypted_api_key;
  if (!encrypted) return null;

  let apiKey: string;
  try {
    apiKey = decrypt(encrypted);
  } catch (err) {
    console.error("[llm] Falha ao decifrar API key da config ativa:", err);
    return null;
  }

  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    model: row.model,
    apiKey,
    credentialId: row.credential_id,
    credentialLabel: row.label,
  };
}

export interface PublicLlmConfig {
  provider: LlmProvider;
  model: string;
  /** Mascarada — apenas para exibir status/preview na UI. */
  apiKeyMasked: string;
  credentialId: string | null;
  credentialLabel: string | null;
}

/**
 * Versão segura para enviar pra UI: retorna provider/model/máscara, sem expor
 * a API key real.
 */
export async function getPublicActiveLlmConfig(): Promise<PublicLlmConfig | null> {
  const cfg = await getActiveLlmConfig();
  if (!cfg) return null;
  const tail = cfg.apiKey.slice(-4);
  return {
    provider: cfg.provider,
    model: cfg.model,
    apiKeyMasked: `••••••••${tail}`,
    credentialId: cfg.credentialId,
    credentialLabel: cfg.credentialLabel,
  };
}
