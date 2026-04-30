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
}

const VALID_PROVIDERS = new Set<LlmProvider>([
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
]);

export async function getActiveLlmConfig(): Promise<ActiveLlmConfig | null> {
  await ensureLlmTables();
  const result = await pgPool.query<{
    id: string;
    provider: string;
    model: string;
    encrypted_api_key: string;
  }>(
    `SELECT id, provider, model, encrypted_api_key
       FROM llm_configs
      WHERE is_active = true
      ORDER BY updated_at DESC
      LIMIT 1`,
  );

  if (result.rowCount === 0) return null;
  const row = result.rows[0];

  if (!VALID_PROVIDERS.has(row.provider as LlmProvider)) {
    return null;
  }

  let apiKey: string;
  try {
    apiKey = decrypt(row.encrypted_api_key);
  } catch (err) {
    console.error("[llm] Falha ao decifrar API key da config ativa:", err);
    return null;
  }

  return {
    id: row.id,
    provider: row.provider as LlmProvider,
    model: row.model,
    apiKey,
  };
}

export interface PublicLlmConfig {
  provider: LlmProvider;
  model: string;
  /** Mascarada — apenas para exibir status/preview na UI. */
  apiKeyMasked: string;
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
  };
}
