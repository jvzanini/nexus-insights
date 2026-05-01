/**
 * Dashboard v0.10 — coortes coerentes:
 *  - 4 KPIs no MESMO recorte (created_at no período):
 *      1. Conversas recebidas
 *      2. Conversas resolvidas (status=1)
 *      3. Conversas abertas (status=0)
 *      4. Taxa de resolução (resolvidas / recebidas) — sempre ≤ 100%
 *  - Chart bucketed (hora se ≤ 2 dias, dia caso contrário).
 *  - Top atendentes mais rápidos (first_response no período).
 *  - byTeam: contagem por departamento (open+pending+snoozed) com bucket
 *    "Sem departamento" (team_id IS NULL).
 *  - byStatus: contagem por status no período (4 fatias).
 *  - topInboxes: inboxes em aberto no período (status=0).
 *  - noResponse: total + mais antiga + 5 últimas — status=0 + última msg do contato.
 *  - 10 conversas mais recentes.
 *
 * Cache pull-through 30s. Cache key bumped (v2) — invalida v1 ao subir.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { getPlatformTz } from "@/lib/datetime";

const DEFAULT_TTL_SECONDS = 30;

export interface DashboardComparison {
  received: number | null;
  resolved: number | null;
  open: number | null;
  resolutionRate: number | null;
}

export interface DashboardStats {
  received: number;
  resolved: number;
  open: number;
  resolutionRate: number | null;
  comparison: DashboardComparison;
}

export interface DashboardChartPoint {
  bucket: string; // ISO timestamp (start of bucket)
  received: number;
  resolved: number;
  open: number;
  pending: number;
}

export interface DashboardTopAgent {
  id: number | null;
  name: string;
  avgSeconds: number;
}

export interface DashboardTopInbox {
  id: number;
  name: string;
  count: number;
}

export interface DashboardByTeam {
  /** id null representa o bucket "Sem departamento" (team_id IS NULL). */
  id: number | null;
  name: string;
  count: number;
}

export type DashboardStatusCode = 0 | 1 | 2 | 3;

export interface DashboardByStatus {
  status: DashboardStatusCode;
  label: "Aberto" | "Resolvido" | "Pendente" | "Adiado";
  count: number;
}

export interface DashboardNoResponseItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  waitingSeconds: number;
  lastIncomingAt: string;
}

export interface DashboardNoResponse {
  total: number;
  oldestSeconds: number;
  preview: DashboardNoResponseItem[];
}

export interface DashboardRecentItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  status: number;
  lastActivityAt: string;
}

export interface DashboardData {
  stats: DashboardStats;
  chart: DashboardChartPoint[];
  topAgents: DashboardTopAgent[];
  topInboxes: DashboardTopInbox[];
  byTeam: DashboardByTeam[];
  byStatus: DashboardByStatus[];
  noResponse: DashboardNoResponse;
  recent: DashboardRecentItem[];
  granularity: "hour" | "day";
}

export interface DashboardDataInput {
  accountId: number;
  period: { start: Date; end: Date };
  prevPeriod: { start: Date; end: Date };
  /** default true: exclui inbox Matrix IA (id=31). */
  excludeMatrixIA?: boolean;
  ttlSeconds?: number;
  /**
   * Força a granularity em vez de auto-detectar pelo tamanho da janela.
   * v0.14.0: dashboard usa "hour" para "Dia" e "day" para "Semana"/"Mês",
   * independente de window (mês cheio com referenceDate=hoje pode dar window
   * de só 1 dia, mas o eixo precisa ser por dia).
   */
  forcedGranularity?: "hour" | "day";
}

interface RowCount {
  total: string;
}
interface RowChart {
  bucket: Date;
  received: string;
  resolved: string;
  open: string;
  pending: string;
}
interface RowAgent {
  id: number | null;
  name: string | null;
  avg_seconds: string | null;
}
interface RowInbox {
  id: number;
  name: string | null;
  total: string;
}
interface RowByTeam {
  id: number | null;
  name: string;
  total: string;
}
interface RowByStatus {
  status: number;
  total: string;
}
interface RowNoResponse {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  waiting_seconds: number;
  last_incoming_at: Date;
}
interface RowNoResponseAgg {
  total: number;
  oldest_seconds: number;
}
interface RowRecent {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  status: number;
  last_activity_at: Date;
}

function pctDiff(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

const STATUS_LABELS: Record<DashboardStatusCode, DashboardByStatus["label"]> = {
  0: "Aberto",
  1: "Resolvido",
  2: "Pendente",
  3: "Adiado",
};

export async function dashboardData(args: DashboardDataInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    prevPeriod: {
      start: args.prevPeriod.start.toISOString(),
      end: args.prevPeriod.end.toISOString(),
    },
    excludeMatrixIA,
    tz,
    forcedGranularity: args.forcedGranularity ?? null,
  };

  // Cache key v6 — bump por mudança em granularity forçada (v0.14.0).
  const key = cacheKey({
    scope: "report",
    name: "dashboard-data-v6",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<DashboardData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<DashboardData>(
        async () => {
          const pool = getChatwootPool();

          // Granularidade: forçada pelo caller, ou hora se janela <= ~48h.
          const periodMs =
            args.period.end.getTime() - args.period.start.getTime();
          const granularity: "hour" | "day" =
            args.forcedGranularity ??
            (periodMs <= 1000 * 60 * 60 * 48 ? "hour" : "day");

          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          // ---------- 1. Recebidas no período ----------
          const sqlReceived = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
          `;

          // ---------- 2. Resolvidas — MESMA coorte (created_at no período + status=1 agora) ----------
          const sqlResolved = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 1
              ${matrixClause}
          `;

          // ---------- 3. Abertas — MESMA coorte (created_at no período + status=0 agora) ----------
          const sqlOpen = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
          `;

          // ---------- 4. Recebidas/Resolvidas no período anterior ----------
          const sqlReceivedPrev = sqlReceived;
          const sqlResolvedPrev = sqlResolved;

          // ---------- 5. Chart bucketed (4 séries: received/resolved/open/pending) ----------
          const sqlChart =
            granularity === "hour"
              ? `
              SELECT
                (date_trunc('hour', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
                COUNT(*)::bigint AS received,
                COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved,
                COUNT(*) FILTER (WHERE c.status = 0)::bigint AS open,
                COUNT(*) FILTER (WHERE c.status = 2)::bigint AS pending
              FROM conversations c
              WHERE c.account_id = $1
                AND c.created_at >= $2
                AND c.created_at < $3
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `
              : `
              SELECT
                (date_trunc('day', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
                COUNT(*)::bigint AS received,
                COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved,
                COUNT(*) FILTER (WHERE c.status = 0)::bigint AS open,
                COUNT(*) FILTER (WHERE c.status = 2)::bigint AS pending
              FROM conversations c
              WHERE c.account_id = $1
                AND c.created_at >= $2
                AND c.created_at < $3
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `;

          // ---------- 6. Top atendentes mais rápidos ----------
          const sqlTopAgents = `
            SELECT u.id, u.name, AVG(re.value)::float AS avg_seconds
            FROM reporting_events re
            JOIN conversations c ON c.id = re.conversation_id
            JOIN users u ON u.id = c.assignee_id
            WHERE re.account_id = $1
              AND re.name = 'first_response'
              AND re.value IS NOT NULL
              AND re.created_at >= $2
              AND re.created_at < $3
              ${excludeMatrixIA ? " AND c.inbox_id <> 31" : ""}
            GROUP BY u.id, u.name
            HAVING COUNT(re.id) >= 3
            ORDER BY avg_seconds ASC
            LIMIT 5
          `;

          // ---------- 7. Inboxes em aberto no período ----------
          const sqlTopInboxes = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;

          // ---------- 8. byTeam — open/pending/snoozed por departamento (com bucket "Sem departamento") ----------
          const sqlByTeam = `
            SELECT
              t.id,
              COALESCE(NULLIF(TRIM(t.name), ''), 'Sem departamento') AS name,
              COUNT(c.id)::bigint AS total
            FROM conversations c
            LEFT JOIN teams t ON t.id = c.team_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status IN (0, 2, 3)
              ${matrixClause}
            GROUP BY t.id, t.name
            ORDER BY total DESC
          `;

          // ---------- 9. byStatus — distribuição por status no período ----------
          const sqlByStatus = `
            SELECT
              c.status::int AS status,
              COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY c.status
          `;

          // ---------- 10. noResponse — preview (5) + agg ----------
          const sqlNoResponse = `
            WITH last_msg AS (
              SELECT DISTINCT ON (m.conversation_id)
                m.conversation_id,
                m.created_at,
                m.message_type
              FROM messages m
              ORDER BY m.conversation_id, m.created_at DESC
            )
            SELECT
              c.id,
              c.display_id,
              ct.name AS contact_name,
              ix.name AS inbox_name,
              u.name AS assignee_name,
              EXTRACT(EPOCH FROM (NOW() - lm.created_at))::int AS waiting_seconds,
              lm.created_at AS last_incoming_at
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
            ORDER BY waiting_seconds DESC
            LIMIT 5
          `;

          const sqlNoResponseAgg = `
            WITH last_msg AS (
              SELECT DISTINCT ON (m.conversation_id)
                m.conversation_id,
                m.created_at,
                m.message_type
              FROM messages m
              ORDER BY m.conversation_id, m.created_at DESC
            )
            SELECT
              COUNT(*)::int AS total,
              COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - lm.created_at))), 0)::int AS oldest_seconds
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
          `;

          // ---------- 11. Conversas recentes (10 últimas) ----------
          const sqlRecent = `
            SELECT
              c.id,
              c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT 10
          `;

          const periodParams = [
            args.accountId,
            args.period.start,
            args.period.end,
          ];
          const prevPeriodParams = [
            args.accountId,
            args.prevPeriod.start,
            args.prevPeriod.end,
          ];

          const [
            receivedRes,
            resolvedRes,
            openRes,
            receivedPrevRes,
            resolvedPrevRes,
            openPrevRes,
            chartRes,
            topAgentsRes,
            topInboxesRes,
            byTeamRes,
            byStatusRes,
            noResponseRes,
            noResponseAggRes,
            recentRes,
          ] = await Promise.all([
            pool.query<RowCount>(sqlReceived, periodParams),
            pool.query<RowCount>(sqlResolved, periodParams),
            pool.query<RowCount>(sqlOpen, periodParams),
            pool.query<RowCount>(sqlReceivedPrev, prevPeriodParams),
            pool.query<RowCount>(sqlResolvedPrev, prevPeriodParams),
            pool.query<RowCount>(sqlOpen, prevPeriodParams),
            pool.query<RowChart>(sqlChart, [
              args.accountId,
              args.period.start,
              args.period.end,
              tz,
            ]),
            pool.query<RowAgent>(sqlTopAgents, periodParams),
            pool.query<RowInbox>(sqlTopInboxes, periodParams),
            pool.query<RowByTeam>(sqlByTeam, periodParams),
            pool.query<RowByStatus>(sqlByStatus, periodParams),
            pool.query<RowNoResponse>(sqlNoResponse, periodParams),
            pool.query<RowNoResponseAgg>(sqlNoResponseAgg, periodParams),
            pool.query<RowRecent>(sqlRecent, [args.accountId]),
          ]);

          const received = Number(receivedRes.rows[0]?.total ?? 0);
          const resolved = Number(resolvedRes.rows[0]?.total ?? 0);
          const open = Number(openRes.rows[0]?.total ?? 0);
          const receivedPrev = Number(receivedPrevRes.rows[0]?.total ?? 0);
          const resolvedPrev = Number(resolvedPrevRes.rows[0]?.total ?? 0);

          // Mesma coorte → resolved sempre ≤ received → rate ≤ 100%.
          // Clamp defensivo caso uma race condition gere drift mínimo.
          const resolutionRate =
            received > 0
              ? Math.min(100, (resolved / received) * 100)
              : null;
          const resolutionRatePrev =
            receivedPrev > 0
              ? Math.min(100, (resolvedPrev / receivedPrev) * 100)
              : null;

          const openPrev = Number(openPrevRes.rows[0]?.total ?? 0);

          const comparison: DashboardComparison = {
            received: pctDiff(received, receivedPrev),
            resolved: pctDiff(resolved, resolvedPrev),
            open: pctDiff(open, openPrev),
            resolutionRate:
              resolutionRate !== null && resolutionRatePrev !== null
                ? pctDiff(resolutionRate, resolutionRatePrev)
                : null,
          };

          const byStatusCounts = new Map<number, number>();
          for (const r of byStatusRes.rows) {
            byStatusCounts.set(Number(r.status), Number(r.total ?? 0));
          }
          const byStatus: DashboardByStatus[] = (
            [0, 1, 2, 3] as DashboardStatusCode[]
          ).map((status) => ({
            status,
            label: STATUS_LABELS[status],
            count: byStatusCounts.get(status) ?? 0,
          }));

          const noResponseAggRow = noResponseAggRes.rows[0];

          const data: DashboardData = {
            granularity,
            stats: {
              received,
              resolved,
              open,
              resolutionRate,
              comparison,
            },
            chart: chartRes.rows.map((r) => ({
              bucket: new Date(r.bucket).toISOString(),
              received: Number(r.received ?? 0),
              resolved: Number(r.resolved ?? 0),
              open: Number(r.open ?? 0),
              pending: Number(r.pending ?? 0),
            })),
            topAgents: topAgentsRes.rows
              .filter((r) => r.avg_seconds !== null)
              .map((r) => ({
                id: r.id ?? null,
                name: r.name ?? "(sem nome)",
                avgSeconds: Math.round(Number(r.avg_seconds ?? 0)),
              })),
            topInboxes: topInboxesRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            byTeam: byTeamRes.rows.map((r) => ({
              id: r.id ?? null,
              name: r.name,
              count: Number(r.total ?? 0),
            })),
            byStatus,
            noResponse: {
              total: Number(noResponseAggRow?.total ?? 0),
              oldestSeconds: Number(noResponseAggRow?.oldest_seconds ?? 0),
              preview: noResponseRes.rows.map((r) => ({
                id: r.id,
                displayId: r.display_id,
                contactName: r.contact_name,
                inboxName: r.inbox_name,
                assigneeName: r.assignee_name,
                waitingSeconds: Number(r.waiting_seconds ?? 0),
                lastIncomingAt:
                  r.last_incoming_at instanceof Date
                    ? r.last_incoming_at.toISOString()
                    : String(r.last_incoming_at),
              })),
            },
            recent: recentRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              inboxName: r.inbox_name,
              assigneeName: r.assignee_name,
              status: r.status,
              lastActivityAt: new Date(r.last_activity_at).toISOString(),
            })),
          };

          return data;
        },
        { fallbackKey: key },
      ),
  });
}
