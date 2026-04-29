/**
 * Heatmap de volumetria: dia da semana × hora do dia.
 * Histórico — TTL longo. Hora é convertida para America/Sao_Paulo.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface VolumetriaHeatmapRow {
  dow: number;
  hour: number;
  total: number;
}

const DEFAULT_TTL_SECONDS = 300;

interface RawRow {
  dow: string;
  hour: string;
  total: string;
}

export async function volumetriaHeatmap(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "volumetria-heatmap",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<VolumetriaHeatmapRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<VolumetriaHeatmapRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          const sql = `
            SELECT
              EXTRACT(DOW  FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
              EXTRACT(HOUR FROM (c.created_at AT TIME ZONE 'America/Sao_Paulo'))::int AS hour,
              COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${whereSql}
            GROUP BY 1, 2
            ORDER BY 1, 2
          `;
          const result = await pool.query<RawRow>(sql, params as unknown[]);
          return result.rows.map((r) => ({
            dow: Number(r.dow),
            hour: Number(r.hour),
            total: Number(r.total),
          }));
        },
        { fallbackKey: key },
      ),
  });
}
