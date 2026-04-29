/**
 * Volume de conversas (leads) por dia/semana/mês.
 * Histórico — TTL longo.
 *
 * Quando `compareWith` for `true`, retorna também o total do período
 * imediatamente anterior, com mesma duração, para cálculo de delta.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";
import { calculateDelta, type DeltaDirection } from "@/lib/reports/delta";

export type Granularity = "day" | "week" | "month";

export interface LeadsRecebidosRow {
  bucket: string;
  total: number;
}

export interface LeadsRecebidosComparison {
  previousTotal: number;
  currentTotal: number;
  deltaPct: number;
  direction: DeltaDirection;
}

export interface LeadsRecebidosData {
  rows: LeadsRecebidosRow[];
  comparison?: LeadsRecebidosComparison;
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

interface RawTotal {
  total: string;
}

export async function leadsRecebidos(args: {
  accountId: number;
  filters: ReportFilters;
  granularity: Granularity;
  ttlSeconds?: number;
  compareWith?: boolean;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const trunc = TRUNC_MAP[args.granularity];
  const compareWith = args.compareWith === true;
  const key = cacheKey({
    scope: "report",
    name: `leads-recebidos-${args.granularity}${compareWith ? "-cmp" : ""}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<LeadsRecebidosData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<LeadsRecebidosData>(
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
          const rows: LeadsRecebidosRow[] = result.rows.map((r) => ({
            bucket: r.bucket,
            total: Number(r.total),
          }));

          const data: LeadsRecebidosData = { rows };

          if (compareWith && args.filters.period) {
            const { start, end } = args.filters.period;
            const durationMs = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime());
            const prevStart = new Date(start.getTime() - durationMs);

            const prevFilters: ReportFilters = {
              ...args.filters,
              period: { start: prevStart, end: prevEnd },
            };
            const prevBuilt = buildBaseFilter(prevFilters, args.accountId);
            const sqlPrev = `
              SELECT COUNT(*)::bigint AS total
              FROM conversations c
              WHERE ${prevBuilt.whereSql}
            `;
            const prevRes = await pool.query<RawTotal>(
              sqlPrev,
              prevBuilt.params as unknown[],
            );
            const previousTotal = Number(prevRes.rows[0]?.total ?? 0);
            const currentTotal = rows.reduce((acc, r) => acc + r.total, 0);
            const delta = calculateDelta(currentTotal, previousTotal);
            data.comparison = {
              previousTotal,
              currentTotal,
              deltaPct: delta.percent,
              direction: delta.direction,
            };
          }

          return data;
        },
        { fallbackKey: key },
      ),
  });
}
