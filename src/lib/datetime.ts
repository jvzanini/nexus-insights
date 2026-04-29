// Helpers server-side de datetime: leitura de timezone/locale da plataforma
// (via tabela `app_settings`) + cache em memória.
//
// Re-exporta os helpers PUROS de `@/lib/datetime-core` para que callers
// continuem importando tudo de "@/lib/datetime" como antes.
//
// IMPORTANTE: este arquivo importa `pgPool` (que importa `pg`).
// Client Components devem importar de `@/lib/datetime-core` em vez disso.

import { pgPool } from "@/lib/pg-pool";
import { DEFAULT_TZ, DEFAULT_LOCALE } from "@/lib/datetime-core";

export * from "@/lib/datetime-core";

interface CachedValue {
  value: string;
  expiresAt: number;
}

const SETTINGS_CACHE = new Map<string, CachedValue>();
const CACHE_TTL_MS = 60_000;

const KEY_TZ = "platform.timezone";
const KEY_LOCALE = "platform.locale";

async function readSettingString(
  key: string,
  fallback: string,
): Promise<string> {
  const cached = SETTINGS_CACHE.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value: string = fallback;
  try {
    const result = await pgPool.query<{ value: unknown }>(
      "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
      [key],
    );
    if (result.rowCount && result.rows[0]) {
      const raw = result.rows[0].value;
      if (typeof raw === "string" && raw.trim().length > 0) {
        value = raw;
      } else if (
        raw &&
        typeof raw === "object" &&
        "value" in (raw as Record<string, unknown>) &&
        typeof (raw as Record<string, unknown>).value === "string"
      ) {
        value = (raw as Record<string, string>).value;
      }
    }
  } catch (err) {
    console.warn(`[datetime] Falha ao ler setting "${key}":`, err);
    value = fallback;
  }

  SETTINGS_CACHE.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

export async function getPlatformTz(): Promise<string> {
  return readSettingString(KEY_TZ, DEFAULT_TZ);
}

export async function getPlatformLocale(): Promise<string> {
  return readSettingString(KEY_LOCALE, DEFAULT_LOCALE);
}

export function invalidatePlatformSettings(): void {
  SETTINGS_CACHE.clear();
}
