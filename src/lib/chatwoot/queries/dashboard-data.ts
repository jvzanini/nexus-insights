/**
 * Dashboard "estilo Roteador":
 *  - 4 KPIs com comparison vs período anterior:
 *      1. Conversas recebidas (created_at no período)
 *      2. Conversas resolvidas (status=1, last_activity_at no período)
 *      3. Em aberto (status=0 — agora, snapshot)
 *      4. Taxa de resolução (resolvidas / recebidas) %
 *  - Chart bucketed (hora se ≤ 2 dias, dia caso contrário) com 2 séries:
 *      Recebidas e Resolvidas.
 *  - Top 5 atendentes mais rápidos (avg first_response no período).
 *  - Top 5 inboxes em aberto (snapshot).
 *  - Top 5 departamentos (teams) com mais resolvidas no período.
 *  - 10 conversas mais recentes (ordenadas por last_activity_at desc).
 *
 * Sempre passa pelo filtro base (account_id + exclude Matrix IA inbox 31).
 * Cache pull-through 30s; resilience com fallback ao cache stale.
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

export interface DashboardTopTeam {
  id: number | null;
  name: string;
  count: number;
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
  topTeams: DashboardTopTeam[];
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
}

interface RowCount {
  total: string;
}
interface RowChart {
  bucket: Date;
  received: string;
  resolved: string;
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
interface RowTeam {
  id: number | null;
  name: string | null;
  total: string;
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
  };

  const key = cacheKey({
    scope: "report",
    name: "dashboard-data",
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

          // Granularidade: hora se janela <= ~48h, caso contrário dia.
          const periodMs =
            args.period.end.getTime() - args.period.start.getTime();
          const granularity: "hour" | "day" =
            periodMs <= 1000 * 60 * 60 * 48 ? "hour" : "day";

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

          // ---------- 2. Resolvidas no período (status=1, last_activity_at) ----------
          const sqlResolved = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
          `;

          // ---------- 3. Em aberto AGORA (snapshot) ----------
          const sqlOpen = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status = 0
              ${matrixClause}
          `;

          // ---------- 4. Recebidas no período anterior ----------
          const sqlReceivedPrev = sqlReceived;
          const sqlResolvedPrev = sqlResolved;

          // ---------- 5. Chart bucketed ----------
          const sqlChart =
            granularity === "hour"
              ? `
              SELECT
                date_trunc('hour', c.created_at AT TIME ZONE $4)::timestamp AS bucket,
                COUNT(*)::bigint AS received,
                COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved
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
                date_trunc('day', c.created_at AT TIME ZONE $4)::timestamp AS bucket,
                COUNT(*)::bigint AS received,
                COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved
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

          // ---------- 7. Top inboxes em aberto agora ----------
          const sqlTopInboxes = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.status = 0
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 5
          `;

          // ---------- 8. Top teams (departamentos) resolvidos no período ----------
          const sqlTopTeams = `
            SELECT t.id, t.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN teams t ON t.id = c.team_id
            WHERE c.account_id = $1
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
            GROUP BY t.id, t.name
            ORDER BY total DESC
            LIMIT 5
          `;

          // ---------- 9. Conversas recentes (10 últimas) ----------
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

          const [
            receivedRes,
            resolvedRes,
            openRes,
            receivedPrevRes,
            resolvedPrevRes,
            chartRes,
            topAgentsRes,
            topInboxesRes,
            topTeamsRes,
            recentRes,
          ] = await Promise.all([
            pool.query<RowCount>(sqlReceived, [
              args.accountId,
              args.period.start,
              args.period.end,
            ]),
            pool.query<RowCount>(sqlResolved, [
              args.accountId,
              args.period.start,
              args.period.end,
            ]),
            pool.query<RowCount>(sqlOpen, [args.accountId]),
            pool.query<RowCount>(sqlReceivedPrev, [
              args.accountId,
              args.prevPeriod.start,
              args.prevPeriod.end,
            ]),
            pool.query<RowCount>(sqlResolvedPrev, [
              args.accountId,
              args.prevPeriod.start,
              args.prevPeriod.end,
            ]),
            pool.query<RowChart>(sqlChart, [
              args.accountId,
              args.period.start,
              args.period.end,
              tz,
            ]),
            pool.query<RowAgent>(sqlTopAgents, [
              args.accountId,
              args.period.start,
              args.period.end,
            ]),
            pool.query<RowInbox>(sqlTopInboxes, [args.accountId]),
            pool.query<RowTeam>(sqlTopTeams, [
              args.accountId,
              args.period.start,
              args.period.end,
            ]),
            pool.query<RowRecent>(sqlRecent, [args.accountId]),
          ]);

          const received = Number(receivedRes.rows[0]?.total ?? 0);
          const resolved = Number(resolvedRes.rows[0]?.total ?? 0);
          const open = Number(openRes.rows[0]?.total ?? 0);
          const receivedPrev = Number(receivedPrevRes.rows[0]?.total ?? 0);
          const resolvedPrev = Number(resolvedPrevRes.rows[0]?.total ?? 0);

          const resolutionRate =
            received > 0 ? (resolved / received) * 100 : null;
          const resolutionRatePrev =
            receivedPrev > 0 ? (resolvedPrev / receivedPrev) * 100 : null;

          const comparison: DashboardComparison = {
            received: pctDiff(received, receivedPrev),
            resolved: pctDiff(resolved, resolvedPrev),
            resolutionRate:
              resolutionRate !== null && resolutionRatePrev !== null
                ? resolutionRate - resolutionRatePrev
                : null,
          };

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
            topTeams: topTeamsRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id ?? null,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
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
