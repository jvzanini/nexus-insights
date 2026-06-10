import { redis } from "@/lib/redis";

export interface ResilienceResult<T> {
  data: T;
  stale: boolean;
  error?: string;
}

export async function withChatwootResilience<T>(
  fn: () => Promise<T>,
  opts: { fallbackKey?: string } = {},
): Promise<ResilienceResult<T>> {
  try {
    const data = await fn();
    return { data, stale: false };
  } catch (err) {
    console.error("[chatwoot-pool] query failed:", err);
    if (opts.fallbackKey) {
      // Lê a cópia "último dado bom" (TTL longo, gravada por withCache sob
      // `${key}:last`), que sobrevive à expiração do cache fresco. É o que
      // garante o dashboard/relatórios sempre exibindo algo mesmo quando o
      // Chatwoot recusa conexão (ex.: too many connections for role).
      const stale = await redis.get(`${opts.fallbackKey}:last`);
      if (stale) {
        try {
          const parsed = JSON.parse(stale) as { d: T };
          return {
            data: parsed.d,
            stale: true,
            error: "chatwoot_unavailable",
          };
        } catch {
          // fallback corrompido — relança original
        }
      }
    }
    throw err;
  }
}
