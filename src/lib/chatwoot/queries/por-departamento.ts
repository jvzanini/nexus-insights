/**
 * Métricas por departamento (team_id) para o período filtrado.
 *
 * Inclui apenas conversations onde `team_id IS NOT NULL`.
 * Avg de 1ª resposta vem de reporting_events (LEFT JOIN, evento 'first_response').
 *
 * TTL 300s (histórico).
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface PorDepartamentoRow {
  teamId: number;
  teamName: string;
  volume: number;
  open: number;
  resolved: number;
  pending: number;
  avgFirstResponseSec: number | null;
}

const DEFAULT_TTL_SECONDS = 300;

interface RawRow {
  team_id: number;
  team_name: string | null;
  volume: string | null;
  open: string | null;
  resolved: string | null;
  pending: string | null;
  avg_fr: string | null;
}

export async function porDepartamento(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "por-departamento",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<PorDepartamentoRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<PorDepartamentoRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );

          const sql = `
            SELECT
              t.id AS team_id,
              t.name AS team_name,
              COUNT(c.id)::bigint AS volume,
              SUM(CASE WHEN c.status = 0 THEN 1 ELSE 0 END)::bigint AS open,
              SUM(CASE WHEN c.status = 1 THEN 1 ELSE 0 END)::bigint AS resolved,
              SUM(CASE WHEN c.status = 2 THEN 1 ELSE 0 END)::bigint AS pending,
              AVG(re.value)::float AS avg_fr
            FROM conversations c
            JOIN teams t ON t.id = c.team_id
            LEFT JOIN reporting_events re
              ON re.conversation_id = c.id
             AND re.account_id = c.account_id
             AND re.name = 'first_response'
             AND re.value IS NOT NULL
            WHERE ${whereSql}
              AND c.team_id IS NOT NULL
            GROUP BY t.id, t.name
            ORDER BY volume DESC, t.name ASC
          `;

          const result = await pool.query<RawRow>(sql, params as unknown[]);

          return result.rows.map((r) => ({
            teamId: r.team_id,
            teamName: r.team_name ?? `Team ${r.team_id}`,
            volume: Number(r.volume ?? 0),
            open: Number(r.open ?? 0),
            resolved: Number(r.resolved ?? 0),
            pending: Number(r.pending ?? 0),
            avgFirstResponseSec:
              r.avg_fr === null || r.avg_fr === undefined
                ? null
                : Math.round(Number(r.avg_fr)),
          }));
        },
        { fallbackKey: key },
      ),
  });
}
