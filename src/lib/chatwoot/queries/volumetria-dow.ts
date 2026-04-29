/**
 * Volumetria de conversas por dia da semana (DOW: 0=domingo … 6=sábado).
 * Histórico — TTL longo.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface VolumetriaDowRow {
  dow: number;
  total: number;
}

const DEFAULT_TTL_SECONDS = 300;

interface RawRow {
  dow: string;
  total: string;
}

export async function volumetriaDow(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "volumetria-dow",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<VolumetriaDowRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<VolumetriaDowRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT
              EXTRACT(DOW FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
              COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY 1
            ORDER BY 1
          `;
          const result = await pool.query<RawRow>(sql, params as unknown[]);
          const map = new Map<number, number>();
          for (const r of result.rows) {
            map.set(Number(r.dow), Number(r.total));
          }
          // Garante 0..6 mesmo sem dados.
          return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
            dow,
            total: map.get(dow) ?? 0,
          }));
        },
        { fallbackKey: key },
      ),
  });
}
