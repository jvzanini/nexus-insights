import "server-only";

import { pgPool } from "@/lib/pg-pool";

const CACHE_KEY = "llm.usd_brl.rate_cache";
const SPREAD_KEY = "llm.usd_brl.card_spread";
const TTL_MS = 4 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const SPREAD_MIN = 1.0;
const SPREAD_MAX = 1.3;
const AWESOMEAPI_URL = "https://economia.awesomeapi.com.br/last/USD-BRL";

export const DEFAULT_CARD_SPREAD = 1.1;
export const FALLBACK_COMMERCIAL_RATE = 5.5;

interface CacheEntry {
  commercial: number;
  fetchedAt: string;
}

interface Memo {
  rate: number;
  source: "live" | "cache" | "fallback";
  commercial: number;
  spread: number;
  fetchedAt: Date;
}

let memo: Memo | null = null;

export function __resetUsdBrlCache(): void {
  memo = null;
}

function clampSpread(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_CARD_SPREAD;
  if (n < SPREAD_MIN) return SPREAD_MIN;
  if (n > SPREAD_MAX) return SPREAD_MAX;
  return n;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const r = await pgPool.query<{ value: T }>(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    [key],
  );
  if (r.rowCount === 0) return null;
  // PG retorna jsonb como objeto — em alguns drivers vem como string.
  const v = r.rows[0].value;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v;
}

async function writeRateCache(commercial: number): Promise<void> {
  const payload: CacheEntry = {
    commercial,
    fetchedAt: new Date().toISOString(),
  };
  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'platform', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb, updated_at = NOW()`,
    [CACHE_KEY, JSON.stringify(payload)],
  );
}

async function fetchLiveCommercial(): Promise<number> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(AWESOMEAPI_URL, { signal: ctrl.signal });
    if (!res || !(res as Response).ok) throw new Error("HTTP failure");
    const json = (await (res as Response).json()) as {
      USDBRL?: { bid?: string | number };
    };
    const bid = json?.USDBRL?.bid;
    const num = typeof bid === "number" ? bid : Number(bid);
    if (!Number.isFinite(num) || num <= 0) throw new Error("bid inválido");
    return num;
  } finally {
    clearTimeout(timer);
  }
}

export interface UsdBrlRate {
  /** Cotação efetiva (commercial × spread). */
  rate: number;
  /** Cotação comercial (sem spread) — útil para auditoria. */
  commercial: number;
  /** Spread cartão aplicado. */
  spread: number;
  source: "live" | "cache" | "fallback";
  fetchedAt: Date;
}

export async function getUsdBrlRate(): Promise<UsdBrlRate> {
  if (memo && Date.now() - memo.fetchedAt.getTime() < TTL_MS) {
    return {
      rate: memo.rate,
      commercial: memo.commercial,
      spread: memo.spread,
      source: memo.source,
      fetchedAt: memo.fetchedAt,
    };
  }

  const spreadRaw = await readSetting<number>(SPREAD_KEY);
  const spread = clampSpread(spreadRaw ?? DEFAULT_CARD_SPREAD);
  const cache = await readSetting<CacheEntry>(CACHE_KEY);
  const cacheAgeMs =
    cache?.fetchedAt != null
      ? Date.now() - new Date(cache.fetchedAt).getTime()
      : Number.POSITIVE_INFINITY;

  if (cache && cacheAgeMs < TTL_MS) {
    const rate = +(cache.commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial: cache.commercial,
      spread,
      source: "cache",
      fetchedAt: new Date(),
    };
    return { ...memo };
  }

  // cache expirado/ausente — tenta live
  try {
    const commercial = await fetchLiveCommercial();
    await writeRateCache(commercial);
    const rate = +(commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial,
      spread,
      source: "live",
      fetchedAt: new Date(),
    };
    return { ...memo };
  } catch (err) {
    if (cache) {
      const rate = +(cache.commercial * spread).toFixed(6);
      memo = {
        rate,
        commercial: cache.commercial,
        spread,
        source: "cache",
        fetchedAt: new Date(),
      };
      return { ...memo };
    }
    const commercial = FALLBACK_COMMERCIAL_RATE;
    const rate = +(commercial * spread).toFixed(6);
    memo = {
      rate,
      commercial,
      spread,
      source: "fallback",
      fetchedAt: new Date(),
    };
    console.warn(
      "[exchange-rate] AwesomeAPI indisponível e sem cache. Usando fallback 5.50.",
      err,
    );
    return { ...memo };
  }
}

export async function setCardSpread(spread: number): Promise<void> {
  const clamped = clampSpread(spread);
  await pgPool.query(
    `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ($1, $2::jsonb, 'platform', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $2::jsonb, updated_at = NOW()`,
    [SPREAD_KEY, JSON.stringify(clamped)],
  );
  memo = null; // força próxima chamada recalcular
}
