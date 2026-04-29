import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = "ni:setting:";

export async function getSetting<T = unknown>(
  key: string,
  fallback?: T,
): Promise<T | undefined> {
  const cacheKey = CACHE_PREFIX + key;
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // cache corrompido — segue
    }
  }

  const setting = await prisma.appSetting.findUnique({ where: { key } });
  const value = (setting?.value as T | undefined) ?? fallback;
  if (value !== undefined) {
    await redis.set(cacheKey, JSON.stringify(value), "EX", CACHE_TTL_SECONDS);
  }
  return value;
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const cacheKey = CACHE_PREFIX + "__all__";
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    try {
      return JSON.parse(cached) as Record<string, unknown>;
    } catch {
      // segue
    }
  }
  const rows = await prisma.appSetting.findMany();
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  await redis.set(cacheKey, JSON.stringify(map), "EX", CACHE_TTL_SECONDS);
  return map;
}

export async function invalidateSettingsCache(key?: string) {
  if (key) {
    await redis.del(CACHE_PREFIX + key);
  }
  await redis.del(CACHE_PREFIX + "__all__");
}
