/**
 * Tempos de resposta agregados a partir de `reporting_events`.
 *
 * - first_response: tempo até a primeira resposta humana (segundos).
 * - conversation_resolved: tempo total até resolução (segundos).
 * - business_hours: avg de `value_in_business_hours` em ambos.
 *
 * Retorno: avg, p50, p95, max e count por categoria. Tempos em segundos.
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import type { ReportFilters } from "../filters";

export interface TempoStats {
  avg: number;
  p50: number;
  p95: number;
  max: number;
  count: number;
}

export interface TemposRespostaResult {
  first_response: TempoStats;
  resolution: TempoStats;
  business_hours: {
    first_response_avg: number;
    resolution_avg: number;
  };
}

const DEFAULT_TTL_SECONDS = 300;

type RawRow = {
  avg: string | null;
  p50: string | null;
  p95: string | null;
  max: string | null;
  count: string | null;
  bh_avg: string | null;
} & Record<string, unknown>;

function parseStats(row: RawRow | undefined): TempoStats {
  return {
    avg: Math.round(Number(row?.avg ?? 0)),
    p50: Math.round(Number(row?.p50 ?? 0)),
    p95: Math.round(Number(row?.p95 ?? 0)),
    max: Math.round(Number(row?.max ?? 0)),
    count: Number(row?.count ?? 0),
  };
}

export async function temposResposta(args: {
  connectionId: string;
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "tempos-resposta",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<TemposRespostaResult>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<TemposRespostaResult>(
        async () => {
          // Filtros aplicáveis a reporting_events:
          // - account_id
          // - inbox_id, conversation_id (via JOIN), period (via re.created_at)
          // O builder padrão é orientado a `conversations c`. Aqui geramos
          // um filtro próprio sobre re + JOIN com c quando necessário.
          const params: unknown[] = [];
          let p = 0;
          const reConds: string[] = [];

          reConds.push(`re.account_id = $${++p}`);
          params.push(args.accountId);

          if (args.filters.excludeMatrixIA !== false) {
            reConds.push(`re.inbox_id <> 31`);
          }

          if (args.filters.inboxIds?.length) {
            reConds.push(`re.inbox_id = ANY($${++p})`);
            params.push(args.filters.inboxIds);
          }
          if (args.filters.period?.start) {
            reConds.push(`re.created_at >= $${++p}`);
            params.push(args.filters.period.start);
          }
          if (args.filters.period?.end) {
            reConds.push(`re.created_at < $${++p}`);
            params.push(args.filters.period.end);
          }

          // Para teamIds/assigneeIds/statuses/labels precisamos cruzar com conversations.
          const needsJoin =
            (args.filters.teamIds?.length ?? 0) > 0 ||
            (args.filters.assigneeIds?.length ?? 0) > 0 ||
            (args.filters.statuses?.length ?? 0) > 0 ||
            (args.filters.priorities?.length ?? 0) > 0 ||
            (args.filters.labelIds?.length ?? 0) > 0;

          let joinSql = "";
          if (needsJoin) {
            joinSql = `
              JOIN conversations c
                ON c.id = re.conversation_id
               AND c.account_id = re.account_id
            `;
            if (args.filters.teamIds?.length) {
              reConds.push(`c.team_id = ANY($${++p})`);
              params.push(args.filters.teamIds);
            }
            if (args.filters.assigneeIds?.length) {
              reConds.push(`c.assignee_id = ANY($${++p})`);
              params.push(args.filters.assigneeIds);
            }
            if (args.filters.statuses?.length) {
              reConds.push(`c.status = ANY($${++p})`);
              params.push(args.filters.statuses);
            }
            if (args.filters.priorities?.length) {
              reConds.push(`c.priority = ANY($${++p})`);
              params.push(args.filters.priorities);
            }
            if (args.filters.labelIds?.length) {
              reConds.push(
                `EXISTS (
                  SELECT 1 FROM taggings t
                  WHERE t.taggable_id = c.id
                    AND t.taggable_type = 'Conversation'
                    AND t.tag_id = ANY($${++p})
                )`,
              );
              params.push(args.filters.labelIds);
            }
          }

          const buildEventSql = (eventName: string) => `
            SELECT
              AVG(re.value)::float AS avg,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::float AS p50,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY re.value)::float AS p95,
              MAX(re.value)::float AS max,
              COUNT(*)::bigint AS count,
              AVG(re.value_in_business_hours)::float AS bh_avg
            FROM reporting_events re
            ${joinSql}
            WHERE ${reConds.join(" AND ")}
              AND re.name = '${eventName}'
              AND re.value IS NOT NULL
          `;

          const [firstResp, resolution] = await Promise.all([
            queryNexusChat<RawRow>(
              args.connectionId,
              buildEventSql("first_response"),
              params,
            ),
            queryNexusChat<RawRow>(
              args.connectionId,
              buildEventSql("conversation_resolved"),
              params,
            ),
          ]);

          const data: TemposRespostaResult = {
            first_response: parseStats(firstResp.rows[0]),
            resolution: parseStats(resolution.rows[0]),
            business_hours: {
              first_response_avg: Math.round(
                Number(firstResp.rows[0]?.bh_avg ?? 0),
              ),
              resolution_avg: Math.round(
                Number(resolution.rows[0]?.bh_avg ?? 0),
              ),
            },
          };
          return data;
        },
        { fallbackKey: key },
      ),
  });
}
