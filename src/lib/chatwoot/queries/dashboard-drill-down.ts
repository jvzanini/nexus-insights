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
  items: DrillDownConversationItem[];
  page: number;
  pageSize: number;
  /** @deprecated use items. Mantido por compat para uma versão. */
  recent: DrillDownConversationItem[];
}

export interface ResolvedDrillDownData {
  total: number;
  granularity: "hour" | "day";
  chart: DrillDownChartPoint[];
  byInbox: DrillDownByInbox[];
  byHour: DrillDownByHour[];
  items: DrillDownConversationItem[];
  page: number;
  pageSize: number;
  /** @deprecated use items. Mantido por compat para uma versão. */
  recent: DrillDownConversationItem[];
}

/**
 * Drill-down genérico parametrizado por status (0=Aberto, 1=Resolvido,
 * 2=Pendente, 3=Adiado). Substitui `OpenDrillDownData` (que era específico
 * para status=0).
 */
export interface StatusDrillDownData {
  status: 0 | 1 | 2 | 3;
  total: number;
  byInbox: DrillDownByInbox[];
  items: DrillDownConversationItem[];
  page: number;
  pageSize: number;
}

/**
 * @deprecated use StatusDrillDownData. Type estendido por compat com
 * componentes antigos (que usam `byStatus[]` e `open[]`); preenchido apenas
 * pelo wrapper `getOpenDrillDown`. Será removido em v0.14.0.
 */
export interface OpenDrillDownData extends StatusDrillDownData {
  byStatus: DrillDownByStatus[];
  open: DrillDownConversationItem[];
}

export interface ResolutionRateDrillDownData {
  current: number | null;
  previous: number | null;
  /** @deprecated use diffPct (variação relativa em %). */
  diffPp: number | null;
  diffPct: number | null;
  history: DrillDownHistoricalRatePoint[];
  topAgents: DrillDownAgentRate[];
}

export interface NoResponseDrillDownItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  waitingSeconds: number;
  lastIncomingAt: string;
  snippet: string | null;
}

export interface NoResponseDrillDownAggregation {
  id: number | null;
  name: string;
  count: number;
}

export interface NoResponseDrillDownData {
  total: number;
  oldestSeconds: number;
  items: NoResponseDrillDownItem[];
  byInbox: NoResponseDrillDownAggregation[];
  byAssignee: NoResponseDrillDownAggregation[];
}

export interface ByTeamDrillDownItem {
  id: number;
  displayId: number;
  contactName: string | null;
  inboxName: string | null;
  assigneeName: string | null;
  status: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ByTeamDrillDownData {
  teamId: number | null;
  teamName: string;
  total: number;
  byStatus: DrillDownByStatus[];
  items: ByTeamDrillDownItem[];
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
  0: "Aberta",
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
 *
 * v0.13.0: lista de conversas paginada server-side (`page`/`pageSize`).
 * Default 50/pg, cap 200 (evita OFFSET extremo no Chatwoot read-only).
 * Retorna `items` + `recent` (alias deprecated por compat).
 */
export async function getReceivedDrillDown(
  args: DrillDownPeriodInput & { page?: number; pageSize?: number },
) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();
  const granularity = pickGranularity(args.period);
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, args.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    page,
    pageSize,
    excludeMatrixIA,
    tz,
  };

  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-received-v2",
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
            LIMIT $4 OFFSET $5
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
                pageSize,
                offset,
              ]),
            ]);

          const items = recentRes.rows.map((r) => ({
            id: r.id,
            displayId: r.display_id,
            contactName: r.contact_name,
            inboxName: r.inbox_name,
            assigneeName: r.assignee_name,
            status: r.status,
            lastActivityAt: new Date(r.last_activity_at).toISOString(),
          }));

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
            items,
            page,
            pageSize,
            recent: items,
          };
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Drill-down de "Conversas Resolvidas".
 *
 * v0.13.0: lista de conversas paginada server-side (`page`/`pageSize`).
 * Default 50/pg, cap 200. Retorna `items` + `recent` (alias deprecated).
 */
export async function getResolvedDrillDown(
  args: DrillDownPeriodInput & { page?: number; pageSize?: number },
) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const tz = await getPlatformTz();
  const granularity = pickGranularity(args.period);
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, args.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    page,
    pageSize,
    excludeMatrixIA,
    tz,
  };

  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-resolved-v2",
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

          // v0.10: coorte = created_at ∈ período (mesma de Recebidas/Abertas)
          // garantindo que Recebidas, Resolvidas e Abertas falem da mesma coorte.
          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 1
              ${matrixClause}
          `;
          const sqlChart =
            granularity === "hour"
              ? `
              SELECT
                date_trunc('hour', c.created_at AT TIME ZONE $4)::timestamp AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.created_at >= $2
                AND c.created_at < $3
                AND c.status = 1
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `
              : `
              SELECT
                date_trunc('day', c.created_at AT TIME ZONE $4)::timestamp AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.created_at >= $2
                AND c.created_at < $3
                AND c.status = 1
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
              AND c.status = 1
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
              AND c.status = 1
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
              AND c.status = 1
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT $4 OFFSET $5
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
                pageSize,
                offset,
              ]),
            ]);

          const items = recentRes.rows.map((r) => ({
            id: r.id,
            displayId: r.display_id,
            contactName: r.contact_name,
            inboxName: r.inbox_name,
            assigneeName: r.assignee_name,
            status: r.status,
            lastActivityAt: new Date(r.last_activity_at).toISOString(),
          }));

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
            items,
            page,
            pageSize,
            recent: items,
          };
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * Drill-down genérico de conversas por status.
 *
 * v0.13.0: substitui `getOpenDrillDown` (que era hard-coded em status=0).
 * Aceita status 0 (Aberta) | 1 (Resolvida) | 2 (Pendente) | 3 (Adiada),
 * com paginação server-side (default 50/pg, cap 200).
 *
 * Coorte: created_at ∈ período + status = N.
 *
 * Ordenação:
 *  - status=0 (abertas): `last_activity_at ASC` (mais antigas primeiro =
 *    priorizar resposta).
 *  - demais: `last_activity_at DESC` (mais recentes primeiro).
 */
export interface StatusDrillDownInput extends DrillDownPeriodInput {
  status: 0 | 1 | 2 | 3;
  page?: number;
  pageSize?: number;
}

export async function getStatusDrillDown(args: StatusDrillDownInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, args.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    status: args.status,
    page,
    pageSize,
    excludeMatrixIA,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-status-v3",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<StatusDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<StatusDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
          `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          const orderClause =
            args.status === 0
              ? "ORDER BY c.last_activity_at ASC NULLS LAST"
              : "ORDER BY c.last_activity_at DESC NULLS LAST";
          const sqlList = `
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
              AND c.created_at >= $2 AND c.created_at < $3
              AND c.status = $4
              ${matrixClause}
            ${orderClause}
            LIMIT $5 OFFSET $6
          `;

          const baseParams = [
            args.accountId,
            args.period.start,
            args.period.end,
            args.status,
          ];
          const listParams = [...baseParams, pageSize, offset];

          const [totalRes, byInboxRes, listRes] = await Promise.all([
            pool.query<RowCount>(sqlTotal, baseParams),
            pool.query<RowInbox>(sqlByInbox, baseParams),
            pool.query<RowConversation>(sqlList, listParams),
          ]);

          return {
            status: args.status,
            total: Number(totalRes.rows[0]?.total ?? 0),
            byInbox: byInboxRes.rows
              .filter((r) => r.name)
              .map((r) => ({
                id: r.id,
                name: r.name ?? "(sem nome)",
                count: Number(r.total ?? 0),
              })),
            items: listRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              inboxName: r.inbox_name,
              assigneeName: r.assignee_name,
              status: r.status,
              lastActivityAt: new Date(r.last_activity_at).toISOString(),
            })),
            page,
            pageSize,
          };
        },
        { fallbackKey: key },
      ),
  });
}

/**
 * @deprecated use getStatusDrillDown. Wrapper de compat para callers
 * existentes (KPI "Abertas no período"). Adiciona `byStatus[]` (distribuição
 * por status no recorte) e `open[]` (alias de items) para preservar a UI
 * antiga até T8 reescrever o componente. Cache key separado para isolar
 * payloads enquanto a UI antiga é gradualmente migrada.
 */
export async function getOpenDrillDown(
  args: DrillDownPeriodInput & { page?: number; pageSize?: number },
) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, args.pageSize ?? 50));

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    page,
    pageSize,
    excludeMatrixIA,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-open-v3",
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

          // Distribuição por status no recorte do período (open/pending/snoozed)
          // — só usada pela UI antiga; será removida em T8.
          const sqlByStatus = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status IN (0, 2, 3)
              ${matrixClause}
            GROUP BY c.status
            ORDER BY total DESC
          `;

          const [statusResult, byStatusRes] = await Promise.all([
            getStatusDrillDown({
              accountId: args.accountId,
              period: args.period,
              excludeMatrixIA,
              ttlSeconds: ttl,
              status: 0,
              page,
              pageSize,
            }),
            pool.query<RowStatus>(sqlByStatus, [
              args.accountId,
              args.period.start,
              args.period.end,
            ]),
          ]);

          const base = statusResult.data;
          return {
            ...base,
            open: base.items,
            byStatus: byStatusRes.rows.map((r) => ({
              status: Number(r.status),
              label: STATUS_LABELS[Number(r.status)] ?? "—",
              count: Number(r.total ?? 0),
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
    name: "dashboard-drill-resolution-v2",
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
          // Variação relativa em % (não pp). Quando previous=0 e current=0 → 0%
          // (sem mudança); quando previous=0 e current>0 → null (não definido,
          // a UI mostra "—" ou um badge "Novo").
          const diffPct =
            current !== null && previous !== null
              ? previous === 0
                ? current === 0
                  ? 0
                  : null
                : ((current - previous) / previous) * 100
              : null;

          return {
            current,
            previous,
            diffPp,
            diffPct,
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

/* ----------------------------- noResponse ----------------------------- */

interface RowNoResponseFull {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  waiting_seconds: number;
  last_incoming_at: Date;
  snippet: string | null;
}
interface RowNoResponseAggLocal {
  total: number;
  oldest_seconds: number;
}
interface RowNoResponseGroup {
  id: number | null;
  name: string;
  total: string;
}

/**
 * Drill-down "Conversas sem resposta no período".
 *
 * Definição: status=0 + última mensagem da conversa é do contato (message_type=0).
 * Coorte: created_at ∈ período.
 */
export async function getNoResponseDrillDown(args: DrillDownPeriodInput) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    excludeMatrixIA,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-no-response",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<NoResponseDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<NoResponseDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";

          const sqlAgg = `
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

          const sqlList = `
            WITH last_msg AS (
              SELECT DISTINCT ON (m.conversation_id)
                m.conversation_id,
                m.created_at,
                m.message_type,
                m.content
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
              lm.created_at AS last_incoming_at,
              lm.content AS snippet
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
            LIMIT 100
          `;

          const sqlByInbox = `
            WITH last_msg AS (
              SELECT DISTINCT ON (m.conversation_id)
                m.conversation_id,
                m.message_type
              FROM messages m
              ORDER BY m.conversation_id, m.created_at DESC
            )
            SELECT
              ix.id,
              COALESCE(NULLIF(TRIM(ix.name), ''), '(sem inbox)') AS name,
              COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
            GROUP BY ix.id, ix.name
            ORDER BY total DESC
          `;

          const sqlByAssignee = `
            WITH last_msg AS (
              SELECT DISTINCT ON (m.conversation_id)
                m.conversation_id,
                m.message_type
              FROM messages m
              ORDER BY m.conversation_id, m.created_at DESC
            )
            SELECT
              u.id,
              COALESCE(NULLIF(TRIM(u.name), ''), 'Sem atendente') AS name,
              COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status = 0
              ${matrixClause}
            GROUP BY u.id, u.name
            ORDER BY total DESC
          `;

          const periodParams = [
            args.accountId,
            args.period.start,
            args.period.end,
          ];

          const [aggRes, listRes, byInboxRes, byAssigneeRes] = await Promise.all([
            pool.query<RowNoResponseAggLocal>(sqlAgg, periodParams),
            pool.query<RowNoResponseFull>(sqlList, periodParams),
            pool.query<RowNoResponseGroup>(sqlByInbox, periodParams),
            pool.query<RowNoResponseGroup>(sqlByAssignee, periodParams),
          ]);

          const agg = aggRes.rows[0];
          return {
            total: Number(agg?.total ?? 0),
            oldestSeconds: Number(agg?.oldest_seconds ?? 0),
            items: listRes.rows.map((r) => ({
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
              snippet: r.snippet,
            })),
            byInbox: byInboxRes.rows.map((r) => ({
              id: r.id ?? null,
              name: r.name,
              count: Number(r.total ?? 0),
            })),
            byAssignee: byAssigneeRes.rows.map((r) => ({
              id: r.id ?? null,
              name: r.name,
              count: Number(r.total ?? 0),
            })),
          };
        },
        { fallbackKey: key },
      ),
  });
}

/* ------------------------------ byTeam ------------------------------ */

interface RowByTeamItem {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  assignee_name: string | null;
  status: number;
  created_at: Date;
  last_activity_at: Date;
}

/**
 * Drill-down de departamento (incluindo bucket "Sem departamento" quando teamId=null).
 *
 * Coorte: created_at ∈ período + status IN (0, 2, 3) (mesmo recorte do card).
 */
export async function getByTeamDrillDown(args: {
  accountId: number;
  period: { start: Date; end: Date };
  /** null = bucket "Sem departamento" */
  teamId: number | null;
  excludeMatrixIA?: boolean;
  ttlSeconds?: number;
}) {
  const ttl = args.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const excludeMatrixIA = args.excludeMatrixIA !== false;

  const filtersForHash = {
    period: {
      start: args.period.start.toISOString(),
      end: args.period.end.toISOString(),
    },
    teamId: args.teamId,
    excludeMatrixIA,
  };
  const key = cacheKey({
    scope: "report",
    name: "dashboard-drill-by-team",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ByTeamDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ByTeamDrillDownData>(
        async () => {
          const pool = getChatwootPool();
          const matrixClause = excludeMatrixIA ? " AND c.inbox_id <> 31" : "";
          const teamClause =
            args.teamId === null
              ? " AND c.team_id IS NULL"
              : " AND c.team_id = $4::int";

          const baseParams: unknown[] = [
            args.accountId,
            args.period.start,
            args.period.end,
          ];
          const params =
            args.teamId === null ? baseParams : [...baseParams, args.teamId];

          const sqlTotalAndName = `
            SELECT
              COUNT(c.id)::bigint AS total,
              MAX(COALESCE(NULLIF(TRIM(t.name), ''), 'Sem departamento')) AS team_name
            FROM conversations c
            LEFT JOIN teams t ON t.id = c.team_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status IN (0, 2, 3)
              ${teamClause}
              ${matrixClause}
          `;

          const sqlByStatus = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status IN (0, 2, 3)
              ${teamClause}
              ${matrixClause}
            GROUP BY c.status
            ORDER BY total DESC
          `;

          const sqlList = `
            SELECT
              c.id, c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              u.name AS assignee_name,
              c.status,
              c.created_at,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              AND c.status IN (0, 2, 3)
              ${teamClause}
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT 100
          `;

          const [totalRes, byStatusRes, listRes] = await Promise.all([
            pool.query<{ total: string; team_name: string | null }>(
              sqlTotalAndName,
              params,
            ),
            pool.query<RowStatus>(sqlByStatus, params),
            pool.query<RowByTeamItem>(sqlList, params),
          ]);

          const totalRow = totalRes.rows[0];
          const teamName =
            args.teamId === null
              ? "Sem departamento"
              : (totalRow?.team_name ?? "(sem nome)");

          return {
            teamId: args.teamId,
            teamName,
            total: Number(totalRow?.total ?? 0),
            byStatus: byStatusRes.rows.map((r) => ({
              status: Number(r.status),
              label: STATUS_LABELS[Number(r.status)] ?? "—",
              count: Number(r.total ?? 0),
            })),
            items: listRes.rows.map((r) => ({
              id: r.id,
              displayId: r.display_id,
              contactName: r.contact_name,
              inboxName: r.inbox_name,
              assigneeName: r.assignee_name,
              status: r.status,
              createdAt: new Date(r.created_at).toISOString(),
              lastActivityAt: new Date(r.last_activity_at).toISOString(),
            })),
          };
        },
        { fallbackKey: key },
      ),
  });
}
