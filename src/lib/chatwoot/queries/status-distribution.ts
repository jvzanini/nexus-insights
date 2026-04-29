/**
 * Distribuição de conversas por status (0=open, 1=resolved, 2=pending, 3=snoozed).
 * Live KPI — TTL curto.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface StatusDistributionRow {
  status: number;
  total: number;
}

const ALL_STATUSES = [0, 1, 2, 3] as const;
const DEFAULT_TTL_SECONDS = 30;

interface RawRow {
  status: number;
  total: string;
}

export async function statusDistribution(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "kpi",
    name: "status-distribution",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<StatusDistributionRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<StatusDistributionRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY c.status
          `;
          const result = await pool.query<RawRow>(sql, params as unknown[]);
          const map = new Map<number, number>();
          for (const r of result.rows) {
            map.set(r.status, Number(r.total));
          }
          return ALL_STATUSES.map((status) => ({
            status,
            total: map.get(status) ?? 0,
          }));
        },
        { fallbackKey: key },
      ),
  });
}
