import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { getActiveLlmConfig } from "./get-active-config";

/**
 * Lê a flag global `nex.bubble_enabled` da tabela `app_settings`. Esse setting
 * controla a visibilidade da bolha flutuante do Agente Nex em todas as páginas
 * autenticadas.
 *
 * Default:
 *  - `true` quando existe uma config LLM ativa (faz sentido mostrar a bolha).
 *  - `false` caso contrário (sem provedor configurado, a bolha não aparece).
 *
 * Cache em memória (TTL 30s) — `setNexBubbleEnabled` invalida explicitamente
 * via `invalidateNexBubbleEnabled()` após cada mudança.
 */

const KEY = "nex.bubble_enabled";
const TTL_MS = 30_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function isNexBubbleEnabled(): Promise<boolean> {
  const cached = cache.get(KEY);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let value = false;
  try {
    const r = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [KEY],
    );

    if (r.rowCount && r.rowCount > 0) {
      const raw = r.rows[0]!.value;
      if (typeof raw === "boolean") {
        value = raw;
      } else if (typeof raw === "string") {
        value = raw === "true";
      } else {
        value = Boolean(raw);
      }
    } else {
      // Default: ON quando há config LLM ativa, OFF caso contrário.
      const config = await getActiveLlmConfig();
      value = !!config;
    }
  } catch (err) {
    console.error("[isNexBubbleEnabled]", err);
    value = false;
  }

  cache.set(KEY, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** Limpa o cache em memória — chamar após `setNexBubbleEnabled`. */
export function invalidateNexBubbleEnabled(): void {
  cache.clear();
}

/** Apenas para testes — força rebuild do cache em memória. */
export function __resetNexBubbleCache(): void {
  cache.clear();
}
