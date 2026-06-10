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
        await redis.set(
          args.key,
          JSON.stringify({ d: result.data, t: new Date().toISOString() }),
          "EX",
          args.ttlSeconds,
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
