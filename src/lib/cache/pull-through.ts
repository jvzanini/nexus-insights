import { redis } from "@/lib/redis";

export interface CachedResult<T> {
  data: T;
  cached: boolean;
  cachedAt?: Date;
  stale: boolean;
  error?: string;
}

type FetcherResult<T> = { data: T; stale: boolean; error?: string };

/**
 * Single-flight: quando o cache expira (TTL 30s < polling 60s ⇒ sempre erra
 * entre polls), N requisições concorrentes da mesma chave passariam pelo
 * `fetcher` ao mesmo tempo e saturariam o pool max:1 do Chatwoot — causa do
 * "erro ao carregar" intermitente. Este Map deduplica: só o líder executa o
 * fetch; os seguidores aguardam a mesma promise. Per-process (cada instância
 * Node tem o seu), o que já elimina o thundering herd local do polling.
 */
const inFlight = new Map<string, Promise<FetcherResult<unknown>>>();

/**
 * TTL da cópia "último dado bom" (`${key}:last`). Bem maior que o TTL fresco
 * (30s): é o que `withChatwootResilience` serve quando o Chatwoot falha (ex.:
 * too many connections for role), garantindo dashboard/relatórios SEMPRE com
 * dado em vez de erro. 24h é folgado para qualquer pico/restart.
 */
const LAST_GOOD_TTL_SECONDS = 24 * 60 * 60;

export async function withCache<T>(args: {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<FetcherResult<T>>;
}): Promise<CachedResult<T>> {
  const raw = await redis.get(args.key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { d: T; t: string };
      return {
        data: parsed.d,
        cached: true,
        cachedAt: new Date(parsed.t),
        stale: false,
      };
    } catch {
      // se cache corrompido, segue para fetcher
    }
  }

  let flight = inFlight.get(args.key) as Promise<FetcherResult<T>> | undefined;
  if (!flight) {
    flight = (async (): Promise<FetcherResult<T>> => {
      const result = await args.fetcher();
      if (!result.stale) {
        const payload = JSON.stringify({
          d: result.data,
          t: new Date().toISOString(),
        });
        // Cache fresco de curta duração + cópia "último dado bom" de longa
        // duração (fallback de resiliência lido por withChatwootResilience).
        await redis.set(args.key, payload, "EX", args.ttlSeconds);
        await redis.set(
          `${args.key}:last`,
          payload,
          "EX",
          LAST_GOOD_TTL_SECONDS,
        );
      }
      return result;
    })();
    inFlight.set(args.key, flight as Promise<FetcherResult<unknown>>);
    void flight.finally(() => inFlight.delete(args.key));
  }

  const result = await flight;
  return {
    data: result.data,
    cached: false,
    stale: result.stale,
    error: result.error,
  };
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key);
}
