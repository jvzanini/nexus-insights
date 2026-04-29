/**
 * Volume de conversas (leads) por dia/semana/mês.
 * Histórico — TTL longo.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export type Granularity = "day" | "week" | "month";

export interface LeadsRecebidosRow {
  bucket: string;
  total: number;
}

const DEFAULT_TTL_SECONDS = 300;

const TRUNC_MAP: Record<Granularity, string> = {
  day: "day",
  week: "week",
  month: "month",
};

interface RawRow {
  bucket: string;
  total: string;
}

export async function leadsRecebidos(args: {
  accountId: number;
  filters: ReportFilters;
  granularity: Granularity;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const trunc = TRUNC_MAP[args.granularity];
  const key = cacheKey({
    scope: "report",
    name: `leads-recebidos-${args.granularity}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<LeadsRecebidosRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<LeadsRecebidosRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT to_char(date_trunc('${trunc}', c.created_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS bucket,
                   COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY 1
            ORDER BY 1
          `;
          const result = await pool.query<RawRow>(sql, params as unknown[]);
          return result.rows.map((r) => ({
            bucket: r.bucket,
            total: Number(r.total),
          }));
        },
        { fallbackKey: key },
      ),
  });
}
