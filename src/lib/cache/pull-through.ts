import { redis } from "@/lib/redis";

export interface CachedResult<T> {
  data: T;
  cached: boolean;
  cachedAt?: Date;
  stale: boolean;
  error?: string;
}

export async function withCache<T>(args: {
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<{ data: T; stale: boolean; error?: string }>;
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

  const result = await args.fetcher();
  if (!result.stale) {
    await redis.set(
      args.key,
      JSON.stringify({ d: result.data, t: new Date().toISOString() }),
      "EX",
      args.ttlSeconds,
    );
  }
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
