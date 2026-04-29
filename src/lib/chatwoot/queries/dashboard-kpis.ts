/**
 * KPIs operacionais do dashboard:
 *
 *  - "Agora" (sem período): em aberto, pendentes, mensagens não respondidas,
 *    top atendentes com backlog em aberto, top inboxes com backlog em aberto.
 *  - "No período" (respeita filtro): resolvidas, top atendentes mais rápidos
 *    (avg first_response em segundos).
 *
 * Sempre passa pelo `buildBaseFilter` para herdar o tenant guard
 * (`account_id`) e a exclusão default da inbox Matrix IA (id 31).
 *
 * TTL curto (30s) — painel atualiza por polling/refresh.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface AgentRapidoRow {
  name: string;
  avgSeconds: number;
}

export interface AgentBacklogRow {
  name: string;
  count: number;
}

export interface InboxBacklogRow {
  name: string;
  count: number;
}

export interface DashboardKpis {
  emAberto: number;
  pendentes: number;
  resolvidasNoPeriodo: number;
  mensagensNaoRespondidas: number;
  topAtendentesRapidos: AgentRapidoRow[];
  topAtendentesEmAberto: AgentBacklogRow[];
  topInboxesEmAberto: InboxBacklogRow[];
}

const DEFAULT_TTL_SECONDS = 30;

interface RowCount {
  total: string;
}
interface RowAgentRapido {
  name: string | null;
  avg_seconds: string | null;
}
interface RowAgentBacklog {
  name: string | null;
  total: string;
}
interface RowInboxBacklog {
  name: string | null;
  total: string;
}

export async function dashboardKpis(args: {
  accountId: number;
  filters: ReportFilters;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const key = cacheKey({
    scope: "report",
    name: "dashboard-kpis",
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<DashboardKpis>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<DashboardKpis>(
        async () => {
          const pool = getChatwootPool();

          // Filtro "agora" (sem período) — herda exclude Matrix IA + inbox/team filters.
          const filtersAgora: ReportFilters = {
            ...args.filters,
            period: undefined,
            statuses: undefined,
          };
          const baseAgora = buildBaseFilter(filtersAgora, args.accountId);

          // Filtro "no período" — usa as datas do filtro recebido.
          const baseComPeriodo = buildBaseFilter(args.filters, args.accountId);

          // ----- Em Aberto (status=0, agora) -----
          const sqlEmAberto = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${baseAgora.whereSql}
              AND c.status = 0
          `;

          // ----- Pendentes (status=2, agora) -----
          const sqlPendentes = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${baseAgora.whereSql}
              AND c.status = 2
          `;

          // ----- Resolvidas no período (status=1) -----
          // Heurística: status=1 e last_activity_at dentro do range.
          // Para evitar mexer no buildBaseFilter (que opera em created_at),
          // construímos a cláusula de período manualmente sobre last_activity_at.
          const params1: unknown[] = [...baseAgora.params];
          const placeholders: string[] = [];
          if (args.filters.period?.start) {
            placeholders.push(`c.last_activity_at >= $${params1.length + 1}`);
            params1.push(args.filters.period.start);
          }
          if (args.filters.period?.end) {
            placeholders.push(`c.last_activity_at < $${params1.length + 1}`);
            params1.push(args.filters.period.end);
          }
          const periodoClause = placeholders.length
            ? ` AND ${placeholders.join(" AND ")}`
            : "";
          const sqlResolvidas = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${baseAgora.whereSql}
              AND c.status = 1${periodoClause}
          `;

          // ----- Mensagens não respondidas (status=0 + última msg incoming) -----
          const sqlNaoRespondidas = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE ${baseAgora.whereSql}
              AND c.status = 0
              AND (
                SELECT m.message_type
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
              ) = 0
          `;

          // ----- Top 5 atendentes mais rápidos (avg first_response no período) -----
          // Usa reporting_events. Filtro de período aplica em re.created_at.
          const params2: unknown[] = [args.accountId];
          let p2 = 1;
          let periodoReClause = "";
          if (args.filters.period?.start) {
            periodoReClause += ` AND re.created_at >= $${++p2}`;
            params2.push(args.filters.period.start);
          }
          if (args.filters.period?.end) {
            periodoReClause += ` AND re.created_at < $${++p2}`;
            params2.push(args.filters.period.end);
          }
          // Inbox/Team filters aplicam via JOIN em conversations.
          let inboxTeamClause = "";
          if (args.filters.inboxIds?.length) {
            inboxTeamClause += ` AND c.inbox_id = ANY($${++p2})`;
            params2.push(args.filters.inboxIds);
          }
          if (args.filters.teamIds?.length) {
            inboxTeamClause += ` AND c.team_id = ANY($${++p2})`;
            params2.push(args.filters.teamIds);
          }
          const excludeMatrixIA = args.filters.excludeMatrixIA !== false;
          const matrixIaClause = excludeMatrixIA
            ? " AND c.inbox_id <> 31"
            : "";

          const sqlAtendentesRapidos = `
            SELECT u.name, AVG(re.value)::float AS avg_seconds
            FROM reporting_events re
            JOIN conversations c ON c.id = re.conversation_id
            JOIN users u ON u.id = c.assignee_id
            WHERE re.account_id = $1
              AND re.name = 'first_response'
              AND re.value IS NOT NULL
              ${periodoReClause}
              ${inboxTeamClause}
              ${matrixIaClause}
            GROUP BY u.id, u.name
            HAVING COUNT(re.id) >= 3
            ORDER BY avg_seconds ASC
            LIMIT 5
          `;

          // ----- Top 5 atendentes com mais conversas em aberto (agora) -----
          const sqlAtendentesEmAberto = `
            SELECT u.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            WHERE ${baseAgora.whereSql}
              AND c.status = 0
            GROUP BY u.id, u.name
            ORDER BY total DESC
            LIMIT 5
          `;

          // ----- Top 5 inboxes com mais conversas em aberto (agora) -----
          const sqlInboxesEmAberto = `
            SELECT i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE ${baseAgora.whereSql}
              AND c.status = 0
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 5
          `;

          const [
            emAbertoRes,
            pendentesRes,
            resolvidasRes,
            naoRespondidasRes,
            atendentesRapidosRes,
            atendentesEmAbertoRes,
            inboxesEmAbertoRes,
          ] = await Promise.all([
            pool.query<RowCount>(sqlEmAberto, baseAgora.params as unknown[]),
            pool.query<RowCount>(sqlPendentes, baseAgora.params as unknown[]),
            pool.query<RowCount>(sqlResolvidas, params1),
            pool.query<RowCount>(
              sqlNaoRespondidas,
              baseAgora.params as unknown[],
            ),
            pool.query<RowAgentRapido>(sqlAtendentesRapidos, params2),
            pool.query<RowAgentBacklog>(
              sqlAtendentesEmAberto,
              baseAgora.params as unknown[],
            ),
            pool.query<RowInboxBacklog>(
              sqlInboxesEmAberto,
              baseAgora.params as unknown[],
            ),
            // baseComPeriodo é mantido como referência (caso queiramos
            // futuramente um KPI "criadas no período"). Hoje resolvidas
            // usa last_activity_at para refletir quando "concluiu".
          ]);
          // baseComPeriodo presente para consistência futura — silenciar TS.
          void baseComPeriodo;

          const data: DashboardKpis = {
            emAberto: Number(emAbertoRes.rows[0]?.total ?? 0),
            pendentes: Number(pendentesRes.rows[0]?.total ?? 0),
            resolvidasNoPeriodo: Number(resolvidasRes.rows[0]?.total ?? 0),
            mensagensNaoRespondidas: Number(
              naoRespondidasRes.rows[0]?.total ?? 0,
            ),
            topAtendentesRapidos: atendentesRapidosRes.rows
              .filter((r) => r.avg_seconds !== null && r.name)
              .map((r) => ({
                name: r.name ?? "(sem nome)",
                avgSeconds: Math.round(Number(r.avg_seconds ?? 0)),
              })),
            topAtendentesEmAberto: atendentesEmAbertoRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            topInboxesEmAberto: inboxesEmAbertoRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
          };
          return data;
        },
        { fallbackKey: key },
      ),
  });
}
