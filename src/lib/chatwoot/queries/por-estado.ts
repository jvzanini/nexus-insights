/**
 * Métricas por estado (cada inbox = um estado/UF, ex.: "MG-Minas Gerais").
 *
 * - Aplica `excludeMatrixIA` por padrão (inbox_id <> 31) via buildBaseFilter.
 * - Top atendente: inbox_id com mais conversas atribuídas no período.
 * - avgFirstResponseSec: AVG sobre reporting_events.value (evento first_response).
 *
 * TTL 300s (histórico).
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface PorEstadoRow {
  inboxId: number;
  inboxName: string;
  volume: number;
  open: number;
  resolved: number;
  pending: number;
  topAgentName: string | null;
  avgFirstResponseSec: number | null;
}

const DEFAULT_TTL_SECONDS = 300;

interface RawRow {
  inbox_id: number;
  inbox_name: string | null;
  volume: string | null;
  open: string | null;
  resolved: string | null;
  pending: string | null;
  avg_fr: string | null;
  top_agent_name: string | null;
}

export async function porEstado(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "por-estado",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<PorEstadoRow[]>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<PorEstadoRow[]>(
        async () => {
          const pool = getChatwootPool();
          const { whereSql, params } = buildBaseFilter(
            args.filters,
            args.accountId,
          );

          // Estratégia em CTEs:
          //   - base: conversas no escopo (filtros + account + matrix-ia + período).
          //   - inbox_agg: contagem por status por inbox.
          //   - re_agg: avg first_response por inbox (apenas eventos com value).
          //   - top_agent: atendente com mais conversas atribuídas por inbox.
          // O LEFT JOIN com inboxes garante a `inbox_name` correta mesmo se o
          // nome mudar; não retornamos inboxes sem volume no período.
          const sql = `
            WITH base AS (
              SELECT
                c.id,
                c.inbox_id,
                c.assignee_id,
                c.status,
                c.account_id
              FROM conversations c
              WHERE ${whereSql}
            ),
            inbox_agg AS (
              SELECT
                b.inbox_id,
                COUNT(*)::bigint AS volume,
                SUM(CASE WHEN b.status = 0 THEN 1 ELSE 0 END)::bigint AS open,
                SUM(CASE WHEN b.status = 1 THEN 1 ELSE 0 END)::bigint AS resolved,
                SUM(CASE WHEN b.status = 2 THEN 1 ELSE 0 END)::bigint AS pending
              FROM base b
              GROUP BY b.inbox_id
            ),
            re_agg AS (
              SELECT
                b.inbox_id,
                AVG(re.value)::float AS avg_fr
              FROM base b
              JOIN reporting_events re
                ON re.conversation_id = b.id
               AND re.account_id = b.account_id
               AND re.name = 'first_response'
               AND re.value IS NOT NULL
              GROUP BY b.inbox_id
            ),
            agent_counts AS (
              SELECT
                b.inbox_id,
                u.id AS user_id,
                u.name AS agent_name,
                COUNT(*)::bigint AS cnt
              FROM base b
              JOIN users u ON u.id = b.assignee_id
              WHERE b.assignee_id IS NOT NULL
              GROUP BY b.inbox_id, u.id, u.name
            ),
            top_agent AS (
              SELECT DISTINCT ON (ac.inbox_id)
                ac.inbox_id,
                ac.agent_name
              FROM agent_counts ac
              ORDER BY ac.inbox_id, ac.cnt DESC, ac.agent_name ASC
            )
            SELECT
              i.id AS inbox_id,
              i.name AS inbox_name,
              ia.volume,
              ia.open,
              ia.resolved,
              ia.pending,
              ra.avg_fr,
              ta.agent_name AS top_agent_name
            FROM inbox_agg ia
            JOIN inboxes i ON i.id = ia.inbox_id
            LEFT JOIN re_agg ra ON ra.inbox_id = ia.inbox_id
            LEFT JOIN top_agent ta ON ta.inbox_id = ia.inbox_id
            ORDER BY ia.volume DESC, i.name ASC
          `;

          const result = await pool.query<RawRow>(sql, params as unknown[]);

          return result.rows.map((r) => ({
            inboxId: r.inbox_id,
            inboxName: r.inbox_name ?? `Inbox ${r.inbox_id}`,
            volume: Number(r.volume ?? 0),
            open: Number(r.open ?? 0),
            resolved: Number(r.resolved ?? 0),
            pending: Number(r.pending ?? 0),
            topAgentName: r.top_agent_name,
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
