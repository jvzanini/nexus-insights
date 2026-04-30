/**
 * Drill-downs dos 4 KPIs do dashboard:
 *  - Recebidas
 *  - Resolvidas
 *  - Em aberto (snapshot)
 *  - Taxa de resolução
 *
 * Cada função roda múltiplas queries em paralelo, sempre com:
 *  - filtro base (account_id + exclude Matrix IA inbox 31 quando aplicável);
 *  - cache pull-through 30s;
 *  - resilience com fallback ao cache stale.
 *
 * Reaproveita ao máximo os SQLs do `dashboard-data.ts` mas com mais detalhe
 * (por hora completa, top 10 por inbox, listas de 20 conversas etc.).
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { getPlatformTz } from "@/lib/datetime";

const DEFAULT_TTL_SECONDS = 30;

export interface DrillDownPeriodInput {
  accountId: number;
  period: { start: Date; end: Date };
  prevPeriod?: { start: Date; end: Date };
  excludeMatrixIA?: boolean;
  ttlSeconds?: number;
}

export interface DrillDownChartPoint {
  bucket: string; // ISO timestamp (start of bucket)
  received: number;
  resolved: number;
}

export interface DrillDownByInbox {
  id: number;
  name: string;
  count: number;
}

export interface DrillDownByHour {
  /** 0..23 */
  hour: number;
  count: number;
}

export interface DrillDownByStatus {
  status: number;
  label: string;
  count: number;
}

export interface DrillDownConversationItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  status: number;
  lastActivityAt: string;
}

export interface DrillDownAgentRate {
  id: number;
  name: string;
  received: number;
  resolved: number;
  resolutionRate: number; // 0..100
}

export interface DrillDownHistoricalRatePoint {
  bucket: string;
  received: number;
  resolved: number;
  /** 0..100 quando há denominador; null caso contrário. */
  rate: number | null;
}

export interface ReceivedDrillDownData {
  total: number;
  granularity: "hour" | "day";
  chart: DrillDownChartPoint[];
  byInbox: DrillDownByInbox[];
  byHour: DrillDownByHour[];
  recent: DrillDownConversationItem[];
}

export interface ResolvedDrillDownData {
  total: number;
  granularity: "hour" | "day";
  chart: DrillDownChartPoint[];
  byInbox: DrillDownByInbox[];
  byHour: DrillDownByHour[];
  recent: DrillDownConversationItem[];
}

export interface OpenDrillDownData {
  total: number;
  byStatus: DrillDownByStatus[];
  byInbox: DrillDownByInbox[];
  open: DrillDownConversationItem[];
}

export interface ResolutionRateDrillDownData {
  current: number | null;
  previous: number | null;
  diffPp: number | null;
  history: DrillDownHistoricalRatePoint[];
  topAgents: DrillDownAgentRate[];
}

interface RowCount {
  total: string;
}
interface RowChart {
  bucket: Date;
  received: string;
  resolved: string;
}
interface RowInbox {
  id: number;
  name: string | null;
  total: string;
}
interface RowHour {
  hour: string;
  total: string;
}
interface RowStatus {
  status: number;
  total: string;
}
interface RowConversation {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  status: number;
  last_activity_at: Date;
}
interface RowAgentRate {
  id: number;
  name: string | null;
  received: string;
  resolved: string;
}

const STATUS_LABELS: Record<number, string> = {
  0: "Em aberto",
  1: "Resolvida",
  2: "Pendente",
  3: "Adiada",
};

function pickGranularity(period: { start: Date; end: Date }): "hour" | "day" {
  const periodMs = period.end.getTime() - period.start.getTime();
  return periodMs <= 1000 * 60 * 60 * 48 ? "hour" : "day";
}

/**
 * Drill-down de "Conversas Recebidas".
 */
export async function getReceivedDrillDown(args: DrillDownPeriodInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();
  const granularity = pickGranularity(args.period);

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    excludeMatrixIA,
    tz,
  };

  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-received",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ReceivedDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ReceivedDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
          `;
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
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          const sqlByHour = `
            SELECT EXTRACT(HOUR FROM c.created_at AT TIME ZONE $4)::int AS hour,
                   COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY hour
            ORDER BY hour ASC
          `;
          const sqlRecent = `
            SELECT
              c.id, c.display_id,
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
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            ORDER BY c.created_at DESC NULLS LAST
            LIMIT 20
          `;

          const [totalRes, chartRes, byInboxRes, byHourRes, recentRes] =
            await Promise.all([
              pool.query<RowCount>(sqlTotal, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              pool.query<RowChart>(sqlChart, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              pool.query<RowInbox>(sqlByInbox, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              pool.query<RowHour>(sqlByHour, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              pool.query<RowConversation>(sqlRecent, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
            ]);

          return {
            total: Number(totalRes.rows[0]?.total ?? 0),
            granularity,
            chart: chartRes.rows.map((r) => ({
              bucket: new Date(r.bucket).toISOString(),
              received: Number(r.received ?? 0),
              resolved: Number(r.resolved ?? 0),
            })),
            byInbox: byInboxRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            byHour: byHourRes.rows.map((r) => ({
              hour: Number(r.hour ?? 0),
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
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Drill-down de "Conversas Resolvidas".
 */
export async function getResolvedDrillDown(args: DrillDownPeriodInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();
  const granularity = pickGranularity(args.period);

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    excludeMatrixIA,
    tz,
  };

  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-resolved",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ResolvedDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ResolvedDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
          `;
          const sqlChart =
            granularity === "hour"
              ? `
              SELECT
                date_trunc('hour', c.last_activity_at AT TIME ZONE $4)::timestamp AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.status = 1
                AND c.last_activity_at >= $2
                AND c.last_activity_at < $3
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `
              : `
              SELECT
                date_trunc('day', c.last_activity_at AT TIME ZONE $4)::timestamp AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.status = 1
                AND c.last_activity_at >= $2
                AND c.last_activity_at < $3
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          const sqlByHour = `
            SELECT EXTRACT(HOUR FROM c.last_activity_at AT TIME ZONE $4)::int AS hour,
                   COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
            GROUP BY hour
            ORDER BY hour ASC
          `;
          const sqlRecent = `
            SELECT
              c.id, c.display_id,
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
              AND c.status = 1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT 20
          `;

          const [totalRes, chartRes, byInboxRes, byHourRes, recentRes] =
            await Promise.all([
              pool.query<RowCount>(sqlTotal, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              pool.query<RowChart>(sqlChart, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              pool.query<RowInbox>(sqlByInbox, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              pool.query<RowHour>(sqlByHour, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              pool.query<RowConversation>(sqlRecent, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
            ]);

          return {
            total: Number(totalRes.rows[0]?.total ?? 0),
            granularity,
            chart: chartRes.rows.map((r) => ({
              bucket: new Date(r.bucket).toISOString(),
              received: Number(r.received ?? 0),
              resolved: Number(r.resolved ?? 0),
            })),
            byInbox: byInboxRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            byHour: byHourRes.rows.map((r) => ({
              hour: Number(r.hour ?? 0),
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
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Drill-down "Em aberto agora" — snapshot.
 */
export async function getOpenDrillDown(args: {
  accountId: number;
  excludeMatrixIA?: boolean;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;

  const filtersForHash = { excludeMatrixIA };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-open",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<OpenDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<OpenDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status = 0
              ${matrixClause}
          `;
          // Aqui mostramos a distribuição completa por status (não só "open"),
          // pra dar contexto: aberto / pendente / adiada.
          const sqlByStatus = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.status IN (0, 2, 3)
              ${matrixClause}
            GROUP BY c.status
            ORDER BY total DESC
          `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.status = 0
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          const sqlOpen = `
            SELECT
              c.id, c.display_id,
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
              AND c.status = 0
              ${matrixClause}
            ORDER BY c.last_activity_at ASC NULLS LAST
            LIMIT 20
          `;

          const [totalRes, byStatusRes, byInboxRes, openRes] =
            await Promise.all([
              pool.query<RowCount>(sqlTotal, [args.accountId]),
              pool.query<RowStatus>(sqlByStatus, [args.accountId]),
              pool.query<RowInbox>(sqlByInbox, [args.accountId]),
              pool.query<RowConversation>(sqlOpen, [args.accountId]),
            ]);

          return {
            total: Number(totalRes.rows[0]?.total ?? 0),
            byStatus: byStatusRes.rows.map((r) => ({
              status: Number(r.status),
              label: STATUS_LABELS[Number(r.status)] ?? "—",
              count: Number(r.total ?? 0),
            })),
            byInbox: byInboxRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            open: openRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              inboxName: r.inbox_name,
              assigneeName: r.assignee_name,
              status: r.status,
              lastActivityAt: new Date(r.last_activity_at).toISOString(),
            })),
          };
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Drill-down "Taxa de Resolução".
 */
export async function getResolutionRateDrillDown(args: DrillDownPeriodInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();
  const granularity = pickGranularity(args.period);

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    prevPeriod: args.prevPeriod
      ? {
          start: args.prevPeriod.start.toISOString(),
          end: args.prevPeriod.end.toISOString(),
        }
      : null,
    excludeMatrixIA,
    tz,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-resolution",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ResolutionRateDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ResolutionRateDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          // Histórico bucketed: recebidas vs resolvidas no mesmo bucket de
          // `created_at` (proxy comum de "taxa por janela").
          const sqlHistory =
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

          const sqlAggCurrent = `
            SELECT
              COUNT(*)::bigint AS received,
              COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
          `;

          // Top atendentes por taxa: precisamos volume mínimo (HAVING) para
          // ranking ser estatisticamente útil.
          const sqlTopAgents = `
            SELECT
              u.id, u.name,
              COUNT(c.id)::bigint AS received,
              COUNT(*) FILTER (WHERE c.status = 1)::bigint AS resolved
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY u.id, u.name
            HAVING COUNT(c.id) >= 5
            ORDER BY (
              COUNT(*) FILTER (WHERE c.status = 1)::float
              / NULLIF(COUNT(c.id), 0)
            ) DESC NULLS LAST
            LIMIT 10
          `;

          const [historyRes, aggCurrentRes, topAgentsRes, aggPrevRes] =
            await Promise.all([
              pool.query<RowChart>(sqlHistory, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              pool.query<{ received: string; resolved: string }>(sqlAggCurrent, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              pool.query<RowAgentRate>(sqlTopAgents, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              args.prevPeriod
                ? pool.query<{ received: string; resolved: string }>(
                    sqlAggCurrent,
                    [
                      args.accountId,
                      args.prevPeriod.start,
                      args.prevPeriod.end,
                    ],
                  )
                : Promise.resolve({ rows: [] }),
            ]);

          const currentReceived = Number(
            aggCurrentRes.rows[0]?.received ?? 0,
          );
          const currentResolved = Number(
            aggCurrentRes.rows[0]?.resolved ?? 0,
          );
          const current =
            currentReceived > 0
              ? (currentResolved / currentReceived) * 100
              : null;

          const prevRow = aggPrevRes.rows[0];
          const previous =
            prevRow && Number(prevRow.received) > 0
              ? (Number(prevRow.resolved) / Number(prevRow.received)) * 100
              : null;

          const diffPp =
            current !== null && previous !== null ? current - previous : null;

          return {
            current,
            previous,
            diffPp,
            history: historyRes.rows.map((r) => {
              const received = Number(r.received ?? 0);
              const resolved = Number(r.resolved ?? 0);
              return {
                bucket: new Date(r.bucket).toISOString(),
                received,
                resolved,
                rate: received > 0 ? (resolved / received) * 100 : null,
              };
            }),
            topAgents: topAgentsRes.rows
              .filter((r) => r.name)
              .map((r) => {
                const received = Number(r.received ?? 0);
                const resolved = Number(r.resolved ?? 0);
                return {
                  id: r.id,
                  name: r.name ?? "(sem nome)",
                  received,
                  resolved,
                  resolutionRate:
                    received > 0 ? (resolved / received) * 100 : 0,
                };
              }),
          };
        },
        { fallbackKey: key },
      ),
  });
}
