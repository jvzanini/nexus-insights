/**
 * Ranking de atendentes por volume, resolvidas e p50 de 1ª resposta.
 *
 * - Volume: total de conversas atendidas (assignee_id no período).
 * - Resolved: conversas com status=1 (resolvidas).
 * - p50FirstResponseSec: percentile_cont(0.5) sobre reporting_events.value
 *   (apenas eventos `first_response` cujo user_id == assignee atual).
 *
 * TTL 300s (histórico).
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface RankingAtendentesRow {
  userId: number;
  name: string | null;
  email: string | null;
  volume: number;
  resolved: number;
  p50FirstResponseSec: number | null;
}

const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_LIMIT = 50;

interface RawRow {
  user_id: number;
  name: string | null;
  email: string | null;
  volume: string | null;
  resolved: string | null;
  p50: string | null;
}

export async function rankingAtendentes(args: {
  accountId: number;
  filters: ReportFilters;
  limit?: number;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const limit = args.limit ?? DEFAULT_LIMIT;
  const key = cacheKey({
    scope: "report",
    name: `ranking-atendentes-l${limit}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<RankingAtendentesRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<RankingAtendentesRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );
          // Adiciona param para o LIMIT.
          const limitParamIndex = params.length + 1;
          const queryParams = [...params, limit];

          const sql = `
            SELECT
              u.id AS user_id,
              u.name,
              u.email,
              COUNT(c.id)::bigint AS volume,
              SUM(CASE WHEN c.status = 1 THEN 1 ELSE 0 END)::bigint AS resolved,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::float AS p50
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            LEFT JOIN reporting_events re
              ON re.conversation_id = c.id
             AND re.account_id = c.account_id
             AND re.name = 'first_response'
             AND re.user_id = c.assignee_id
             AND re.value IS NOT NULL
            WHERE ${whereSql}
              AND c.assignee_id IS NOT NULL
            GROUP BY u.id, u.name, u.email
            ORDER BY volume DESC, u.name ASC
            LIMIT $${limitParamIndex}
          `;

          const result = await pool.query<RawRow>(
            sql,
            queryParams as unknown[],
          );

          return result.rows.map((r) => ({
            userId: r.user_id,
            name: r.name,
            email: r.email,
            volume: Number(r.volume ?? 0),
            resolved: Number(r.resolved ?? 0),
            p50FirstResponseSec:
              r.p50 === null || r.p50 === undefined
                ? null
                : Math.round(Number(r.p50)),
          }));
        },
        { fallbackKey: key },
      ),
  });
}
