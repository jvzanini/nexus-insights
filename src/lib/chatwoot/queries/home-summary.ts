/**
 * KPIs do dashboard "live" da home: volume hoje, backlog (open+pending),
 * órfãs (sem assignee), p50 first response 24h e top 5 atendentes 24h.
 *
 * TTL curto (30s) — esse painel atualiza por polling.
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface HomeSummaryAtendente {
  id: number;
  name: string;
  volume: number;
}

export interface HomeSummary {
  conversasHoje: number;
  conversasOntem: number;
  backlog: number;
  orfas: number;
  p50FirstResponseSec: number;
  topAtendentes: HomeSummaryAtendente[];
}

const DEFAULT_TTL_SECONDS = 30;

// WHY: usamos `type` (não `interface`) porque o helper `queryNexusChat` exige
// `T extends Record<string, unknown>` — interfaces não casam por falta de
// index signature; `type` literal casa.
type RowConversasHoje = {
  total: string;
};
type RowConversasOntem = {
  total: string;
};
type RowBacklog = {
  total: string;
};
type RowOrfas = {
  total: string;
};
type RowP50 = {
  p50: string | null;
};
type RowTopAtendente = {
  id: number;
  name: string | null;
  volume: string;
};

export async function homeSummary(
  connectionId: string,
  args: {
    accountId: number;
    filters: ReportFilters;
    ttlSeconds?: number;
  },
) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "kpi",
    name: "home-summary",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<HomeSummary>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<HomeSummary>(
        async () => {
          const base = buildBaseFilter(args.filters, args.accountId);

          // 1) Conversas criadas hoje (timezone America/Sao_Paulo).
          const sqlHoje = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${base.whereSql}
              AND (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                = (now() AT TIME ZONE 'America/Sao_Paulo')::date
          `;

          // 1b) Conversas criadas ontem (mesma TZ) para comparativo.
          const sqlOntem = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${base.whereSql}
              AND (c.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                = ((now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '1 day')::date
          `;

          // 2) Backlog: abertas + pendentes.
          const sqlBacklog = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${base.whereSql}
              AND c.status IN (0, 2)
          `;

          // 3) Órfãs: sem atendente atribuído (apenas em status open).
          const sqlOrfas = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${base.whereSql}
              AND c.assignee_id IS NULL
              AND c.status = 0
          `;

          // 4) p50 first response últimas 24h via reporting_events.
          // Filtro replicado sem o WHERE base (opera em reporting_events).
          const sqlP50 = `
            SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::float AS p50
            FROM reporting_events re
            WHERE re.account_id = $1
              AND re.name = 'first_response'
              AND re.created_at >= now() - interval '24 hours'
              AND re.value IS NOT NULL
          `;

          // 5) Top 5 atendentes 24h por volume de conversas (com mensagens enviadas).
          const sqlTop = `
            SELECT u.id, u.name, COUNT(DISTINCT c.id)::bigint AS volume
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            WHERE ${base.whereSql}
              AND c.last_activity_at >= now() - interval '24 hours'
              AND c.assignee_id IS NOT NULL
            GROUP BY u.id, u.name
            ORDER BY volume DESC
            LIMIT 5
          `;

          const [hojeRes, ontemRes, backlogRes, orfasRes, p50Res, topRes] =
            await Promise.all([
              queryNexusChat<RowConversasHoje>(
                connectionId,
                sqlHoje,
                base.params as unknown[],
              ),
              queryNexusChat<RowConversasOntem>(
                connectionId,
                sqlOntem,
                base.params as unknown[],
              ),
              queryNexusChat<RowBacklog>(
                connectionId,
                sqlBacklog,
                base.params as unknown[],
              ),
              queryNexusChat<RowOrfas>(
                connectionId,
                sqlOrfas,
                base.params as unknown[],
              ),
              queryNexusChat<RowP50>(connectionId, sqlP50, [args.accountId]),
              queryNexusChat<RowTopAtendente>(
                connectionId,
                sqlTop,
                base.params as unknown[],
              ),
            ]);

          const data: HomeSummary = {
            conversasHoje: Number(hojeRes.rows[0]?.total ?? 0),
            conversasOntem: Number(ontemRes.rows[0]?.total ?? 0),
            backlog: Number(backlogRes.rows[0]?.total ?? 0),
            orfas: Number(orfasRes.rows[0]?.total ?? 0),
            p50FirstResponseSec: Math.round(
              Number(p50Res.rows[0]?.p50 ?? 0),
            ),
            topAtendentes: topRes.rows.map((r) => ({
              id: r.id,
              name: r.name ?? "(sem nome)",
              volume: Number(r.volume),
            })),
          };

          return data;
        },
        { fallbackKey: key },
      ),
  });
}
