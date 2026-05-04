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
 * v0.42 padrão canônico (ver `src/lib/reports/canonical.ts` e
 * `docs/runbooks/canonical-data-rules.md`):
 *  - `getReceivedDrillDown` — único drill que filtra por `c.created_at`
 *    (canonical "created"). KPI Recebidas é a exceção do glossário.
 *  - `getResolvedDrillDown`, `getOpenDrillDown`/`getStatusDrillDown`,
 *    `getNoResponseDrillDown`, `getByTeamDrillDown` — todos filtram por
 *    `c.last_activity_at` (canonical "active") para alinhar com o KPI
 *    correspondente.
 *  - `getResolutionRateDrillDown` — coorte mista intencional (Apêndice A.2):
 *    Recebidas filtra `c.created_at`, Resolvidas filtra `c.last_activity_at +
 *    status=1`. Taxa = Resolvidas/Recebidas pode passar de 100% (equipe
 *    trabalhando backlog); a UI clampa em 100%.
 *  - `getNoResponseDrillDown` usa CTE canônica `last_classification_msg`
 *    (substitui CTE inline `last_msg`).
 *  - `matrixClause` via helper `chatwootMatrixIaClause`.
 *
 * Cache keys bumped: v* → canonical-v0.42 (invalida payloads anteriores).
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { getPlatformTz } from "@/lib/datetime";
import {
  buildLastClassificationMsgCte,
  chatwootMatrixIaClause,
  MSG_INCOMING,
  STATUS_OPEN,
  STATUS_RESOLVED,
} from "@/lib/reports/canonical";

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
  teamName: string | null;
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
  teamName: string | null;
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
  teamName: string | null;
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

// WHY: usamos `type` (não `interface`) porque o helper `queryNexusChat` exige
// `T extends Record<string, unknown>` — interfaces não casam por falta de
// index signature; `type` literal casa.
type RowCount = {
  total: string;
};
type RowChart = {
  bucket: Date;
  received: string;
  resolved: string;
};
type RowInbox = {
  id: number;
  name: string | null;
  total: string;
};
type RowHour = {
  hour: string;
  total: string;
};
type RowStatus = {
  status: number;
  total: string;
};
type RowConversation = {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  team_name: string | null;
  assignee_name: string | null;
  status: number;
  last_activity_at: Date;
};
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
  connectionId: string,
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
    name: "dashboard-drill-received-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ReceivedDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ReceivedDrillDownData>(
        async () => {
          // canonical "created" — único drill que filtra por c.created_at
          // (alinhado com KPI Recebidas). matrixClause via helper canônico.
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

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
                (date_trunc('hour', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
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
                (date_trunc('day', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
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
              t.name AS team_name,
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id
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
              queryNexusChat<RowCount>(connectionId, sqlTotal, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              queryNexusChat<RowChart>(connectionId, sqlChart, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              queryNexusChat<RowInbox>(connectionId, sqlByInbox, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              queryNexusChat<RowHour>(connectionId, sqlByHour, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              queryNexusChat<RowConversation>(connectionId, sqlRecent, [
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
            teamName: r.team_name,
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
  connectionId: string,
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
    name: "dashboard-drill-resolved-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ResolvedDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ResolvedDrillDownData>(
        async () => {
          // canonical "active" — coorte = last_activity_at ∈ período + status=1.
          // Alinha com KPI Resolvidas; conversas resolvidas dentro do período
          // (mesmo que criadas antes) entram. matrixClause via helper canônico.
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
          `;
          const sqlChart =
            granularity === "hour"
              ? `
              SELECT
                (date_trunc('hour', c.last_activity_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.last_activity_at >= $2
                AND c.last_activity_at < $3
                AND c.status = ${STATUS_RESOLVED}
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `
              : `
              SELECT
                (date_trunc('day', c.last_activity_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
                0::bigint AS received,
                COUNT(*)::bigint AS resolved
              FROM conversations c
              WHERE c.account_id = $1
                AND c.last_activity_at >= $2
                AND c.last_activity_at < $3
                AND c.status = ${STATUS_RESOLVED}
                ${matrixClause}
              GROUP BY bucket
              ORDER BY bucket ASC
            `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
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
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
            GROUP BY hour
            ORDER BY hour ASC
          `;
          const sqlRecent = `
            SELECT
              c.id, c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              t.name AS team_name,
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT $4 OFFSET $5
          `;

          const [totalRes, chartRes, byInboxRes, byHourRes, recentRes] =
            await Promise.all([
              queryNexusChat<RowCount>(connectionId, sqlTotal, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              queryNexusChat<RowChart>(connectionId, sqlChart, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              queryNexusChat<RowInbox>(connectionId, sqlByInbox, [
                args.accountId,
                args.period.start,
                args.period.end,
              ]),
              queryNexusChat<RowHour>(connectionId, sqlByHour, [
                args.accountId,
                args.period.start,
                args.period.end,
                tz,
              ]),
              queryNexusChat<RowConversation>(connectionId, sqlRecent, [
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
            teamName: r.team_name,
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
 * v0.42 canonical "active": coorte = last_activity_at ∈ período + status = N.
 * Alinha com KPIs (Abertas/Resolvidas/Pendentes/Adiadas) que filtram por
 * last_activity_at.
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

export async function getStatusDrillDown(
  connectionId: string,
  args: StatusDrillDownInput,
) {
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
    name: "dashboard-drill-status-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<StatusDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<StatusDrillDownData>(
        async () => {
          // canonical "active" — coorte = last_activity_at ∈ período + status=N.
          // matrixClause via helper canônico.
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

          const sqlTotal = `
            SELECT COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2 AND c.last_activity_at < $3
              AND c.status = $4
              ${matrixClause}
          `;
          const sqlByInbox = `
            SELECT i.id, i.name, COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN inboxes i ON i.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2 AND c.last_activity_at < $3
              AND c.status = $4
              ${matrixClause}
            GROUP BY i.id, i.name
            ORDER BY total DESC
            LIMIT 10
          `;
          const orderClause =
            args.status === STATUS_OPEN
              ? "ORDER BY c.last_activity_at ASC NULLS LAST"
              : "ORDER BY c.last_activity_at DESC NULLS LAST";
          const sqlList = `
            SELECT
              c.id, c.display_id,
              ct.name AS contact_name,
              i.name AS inbox_name,
              t.name AS team_name,
              u.name AS assignee_name,
              c.status,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2 AND c.last_activity_at < $3
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
            queryNexusChat<RowCount>(connectionId, sqlTotal, baseParams),
            queryNexusChat<RowInbox>(connectionId, sqlByInbox, baseParams),
            queryNexusChat<RowConversation>(connectionId, sqlList, listParams),
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
              teamName: r.team_name,
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
  connectionId: string,
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
    name: "dashboard-drill-open-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<OpenDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<OpenDrillDownData>(
        async () => {
          // canonical "active" — KPI Abertas filtra por last_activity_at;
          // distribuição por status segue mesma coorte. matrixClause via
          // helper canônico.
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

          // Distribuição por status no recorte do período (open/pending/snoozed)
          // — só usada pela UI antiga; será removida em T8.
          const sqlByStatus = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status IN (0, 2, 3)
              ${matrixClause}
            GROUP BY c.status
            ORDER BY total DESC
          `;

          const [statusResult, byStatusRes] = await Promise.all([
            getStatusDrillDown(connectionId, {
              accountId: args.accountId,
              period: args.period,
              excludeMatrixIA,
              ttlSeconds: ttl,
              status: STATUS_OPEN,
              page,
              pageSize,
            }),
            queryNexusChat<RowStatus>(connectionId, sqlByStatus, [
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
 *
 * v0.42 canonical (Apêndice A.2): coorte mista intencional.
 *  - Recebidas (denominador) filtra `c.created_at` (canonical "created").
 *  - Resolvidas (numerador) filtra `c.last_activity_at + status=1` (canonical
 *    "active"), alinhando com KPI Resolvidas.
 *  - Taxa = Resolvidas / Recebidas pode passar de 100% (equipe trabalhando
 *    backlog: resolveu mais conversas no período do que entraram). A UI
 *    clampa em 100%; o tooltip explica o caso.
 *
 * Histórico bucketed e topAgents seguem a mesma regra (received=created,
 * resolved=last_activity_at+status=1) — agora calculados via duas queries
 * paralelas e combinados em memória pelo bucket/agente.
 */
export async function getResolutionRateDrillDown(
  connectionId: string,
  args: DrillDownPeriodInput,
) {
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
    name: "dashboard-drill-resolution-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ResolutionRateDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ResolutionRateDrillDownData>(
        async () => {
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

          const truncExpr = granularity === "hour" ? "hour" : "day";

          // Histórico bucketed — Recebidas (canonical "created").
          const sqlHistoryReceived = `
            SELECT
              (date_trunc('${truncExpr}', c.created_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
              COUNT(*)::bigint AS received
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY bucket
            ORDER BY bucket ASC
          `;
          // Histórico bucketed — Resolvidas (canonical "active" + status=1).
          const sqlHistoryResolved = `
            SELECT
              (date_trunc('${truncExpr}', c.last_activity_at AT TIME ZONE $4) AT TIME ZONE $4) AS bucket,
              COUNT(*)::bigint AS resolved
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
            GROUP BY bucket
            ORDER BY bucket ASC
          `;

          // Agregado atual — duas queries (coorte mista).
          const sqlAggReceivedCreated = `
            SELECT COUNT(*)::bigint AS received
            FROM conversations c
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
          `;
          const sqlAggResolvedActive = `
            SELECT COUNT(*)::bigint AS resolved
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
          `;

          // Top atendentes — coorte mista por agente:
          //  - received: assignee_id + created_at ∈ período.
          //  - resolved: assignee_id + last_activity_at ∈ período + status=1.
          // HAVING received >= 5 garante volume mínimo para ranking estatístico.
          const sqlTopAgentsReceived = `
            SELECT
              u.id, u.name,
              COUNT(c.id)::bigint AS received
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.created_at >= $2
              AND c.created_at < $3
              ${matrixClause}
            GROUP BY u.id, u.name
          `;
          const sqlTopAgentsResolved = `
            SELECT
              u.id, u.name,
              COUNT(c.id)::bigint AS resolved
            FROM conversations c
            JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_RESOLVED}
              ${matrixClause}
            GROUP BY u.id, u.name
          `;

          const [
            historyReceivedRes,
            historyResolvedRes,
            aggReceivedRes,
            aggResolvedRes,
            topAgentsReceivedRes,
            topAgentsResolvedRes,
            aggPrevReceivedRes,
            aggPrevResolvedRes,
          ] = await Promise.all([
            queryNexusChat<{ bucket: Date; received: string }>(
              connectionId,
              sqlHistoryReceived,
              [args.accountId, args.period.start, args.period.end, tz],
            ),
            queryNexusChat<{ bucket: Date; resolved: string }>(
              connectionId,
              sqlHistoryResolved,
              [args.accountId, args.period.start, args.period.end, tz],
            ),
            queryNexusChat<{ received: string }>(
              connectionId,
              sqlAggReceivedCreated,
              [args.accountId, args.period.start, args.period.end],
            ),
            queryNexusChat<{ resolved: string }>(
              connectionId,
              sqlAggResolvedActive,
              [args.accountId, args.period.start, args.period.end],
            ),
            queryNexusChat<{ id: number; name: string | null; received: string }>(
              connectionId,
              sqlTopAgentsReceived,
              [args.accountId, args.period.start, args.period.end],
            ),
            queryNexusChat<{ id: number; name: string | null; resolved: string }>(
              connectionId,
              sqlTopAgentsResolved,
              [args.accountId, args.period.start, args.period.end],
            ),
            args.prevPeriod
              ? queryNexusChat<{ received: string }>(
                  connectionId,
                  sqlAggReceivedCreated,
                  [
                    args.accountId,
                    args.prevPeriod.start,
                    args.prevPeriod.end,
                  ],
                )
              : Promise.resolve({ rows: [] }),
            args.prevPeriod
              ? queryNexusChat<{ resolved: string }>(
                  connectionId,
                  sqlAggResolvedActive,
                  [
                    args.accountId,
                    args.prevPeriod.start,
                    args.prevPeriod.end,
                  ],
                )
              : Promise.resolve({ rows: [] }),
          ]);

          const currentReceived = Number(
            aggReceivedRes.rows[0]?.received ?? 0,
          );
          const currentResolved = Number(
            aggResolvedRes.rows[0]?.resolved ?? 0,
          );
          const current =
            currentReceived > 0
              ? (currentResolved / currentReceived) * 100
              : null;

          const prevReceived = Number(
            aggPrevReceivedRes.rows[0]?.received ?? 0,
          );
          const prevResolved = Number(
            aggPrevResolvedRes.rows[0]?.resolved ?? 0,
          );
          const previous =
            prevReceived > 0 ? (prevResolved / prevReceived) * 100 : null;

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

          // Combina history Recebidas + Resolvidas em memória pelo bucket ISO.
          // Coortes diferentes → cada bucket pode ter só received, só resolved,
          // ou ambos. Buckets sem received têm rate=null.
          const historyMap = new Map<
            string,
            { received: number; resolved: number }
          >();
          for (const r of historyReceivedRes.rows) {
            const k = new Date(r.bucket).toISOString();
            const cur = historyMap.get(k) ?? { received: 0, resolved: 0 };
            cur.received = Number(r.received ?? 0);
            historyMap.set(k, cur);
          }
          for (const r of historyResolvedRes.rows) {
            const k = new Date(r.bucket).toISOString();
            const cur = historyMap.get(k) ?? { received: 0, resolved: 0 };
            cur.resolved = Number(r.resolved ?? 0);
            historyMap.set(k, cur);
          }
          const history = Array.from(historyMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([bucket, { received, resolved }]) => ({
              bucket,
              received,
              resolved,
              rate: received > 0 ? (resolved / received) * 100 : null,
            }));

          // Combina topAgents Recebidas + Resolvidas em memória pelo agente.
          // HAVING received >= 5 (filtro estatístico) aplicado em JS após merge.
          const agentMap = new Map<
            number,
            { name: string | null; received: number; resolved: number }
          >();
          for (const r of topAgentsReceivedRes.rows) {
            agentMap.set(r.id, {
              name: r.name,
              received: Number(r.received ?? 0),
              resolved: agentMap.get(r.id)?.resolved ?? 0,
            });
          }
          for (const r of topAgentsResolvedRes.rows) {
            const cur = agentMap.get(r.id);
            if (cur) {
              cur.resolved = Number(r.resolved ?? 0);
            } else {
              // agente que aparece só em Resolvidas (sem Recebidas no período)
              // é incluído com received=0; será filtrado pelo HAVING.
              agentMap.set(r.id, {
                name: r.name,
                received: 0,
                resolved: Number(r.resolved ?? 0),
              });
            }
          }
          const topAgents = Array.from(agentMap.entries())
            .filter(([, v]) => v.name && v.received >= 5)
            .map(([id, v]) => ({
              id,
              name: v.name ?? "(sem nome)",
              received: v.received,
              resolved: v.resolved,
              resolutionRate:
                v.received > 0 ? (v.resolved / v.received) * 100 : 0,
            }))
            .sort((a, b) => b.resolutionRate - a.resolutionRate)
            .slice(0, 10);

          return {
            current,
            previous,
            diffPp,
            diffPct,
            history,
            topAgents,
          };
        },
        { fallbackKey: key },
      ),
  });
}

/* ----------------------------- noResponse ----------------------------- */

type RowNoResponseFull = {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  team_name: string | null;
  assignee_name: string | null;
  waiting_seconds: number;
  last_incoming_at: Date;
  snippet: string | null;
};
type RowNoResponseAggLocal = {
  total: number;
  oldest_seconds: number;
};
type RowNoResponseGroup = {
  id: number | null;
  name: string;
  total: string;
};

/**
 * Drill-down "Conversas sem resposta no período".
 *
 * v0.42 canonical:
 *  - Coorte: `c.last_activity_at ∈ período + status=0` (canonical "active").
 *  - Classificação "última mensagem é do cliente" via CTE canônica
 *    `last_classification_msg` (filtro `lcm.message_type = 0`).
 *  - matrixClause via helper canônico.
 *
 * A CTE canônica considera incoming pública e outgoing qualquer privacidade,
 * fechando o gap em que uma nota privada do agente era ignorada (cliente
 * aparecia como "última msg" indevidamente).
 */
export async function getNoResponseDrillDown(
  connectionId: string,
  args: DrillDownPeriodInput,
) {
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
    name: "dashboard-drill-no-response-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<NoResponseDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<NoResponseDrillDownData>(
        async () => {
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";

          // CTE canônica `last_classification_msg`. Para sqlList precisamos
          // também do snippet da mensagem; carregamos via subquery escalar
          // (LATERAL não vale a pena num caller único). Para os agregados
          // (sqlAgg/sqlByInbox/sqlByAssignee), a CTE basta — só precisamos do
          // created_at (já em msg_created_at) e do filtro message_type.

          const sqlAgg = `
            ${buildLastClassificationMsgCte()}
            SELECT
              COUNT(*)::int AS total,
              COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - lcm.msg_created_at))), 0)::int AS oldest_seconds
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_OPEN}
              ${matrixClause}
          `;

          const sqlList = `
            ${buildLastClassificationMsgCte()}
            SELECT
              c.id,
              c.display_id,
              ct.name AS contact_name,
              ix.name AS inbox_name,
              t.name AS team_name,
              u.name AS assignee_name,
              EXTRACT(EPOCH FROM (NOW() - lcm.msg_created_at))::int AS waiting_seconds,
              lcm.msg_created_at AS last_incoming_at,
              (
                SELECT m.content
                FROM messages m
                WHERE m.conversation_id = c.id
                  AND m.created_at = lcm.msg_created_at
                  AND m.message_type = ${MSG_INCOMING}
                LIMIT 1
              ) AS snippet
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_OPEN}
              ${matrixClause}
            ORDER BY waiting_seconds DESC
            LIMIT 100
          `;

          const sqlByInbox = `
            ${buildLastClassificationMsgCte()}
            SELECT
              ix.id,
              COALESCE(NULLIF(TRIM(ix.name), ''), '(sem inbox)') AS name,
              COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_OPEN}
              ${matrixClause}
            GROUP BY ix.id, ix.name
            ORDER BY total DESC
          `;

          const sqlByAssignee = `
            ${buildLastClassificationMsgCte()}
            SELECT
              u.id,
              COALESCE(NULLIF(TRIM(u.name), ''), 'Sem atendente') AS name,
              COUNT(c.id)::bigint AS total
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status = ${STATUS_OPEN}
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
            queryNexusChat<RowNoResponseAggLocal>(
              connectionId,
              sqlAgg,
              periodParams,
            ),
            queryNexusChat<RowNoResponseFull>(
              connectionId,
              sqlList,
              periodParams,
            ),
            queryNexusChat<RowNoResponseGroup>(
              connectionId,
              sqlByInbox,
              periodParams,
            ),
            queryNexusChat<RowNoResponseGroup>(
              connectionId,
              sqlByAssignee,
              periodParams,
            ),
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
              teamName: r.team_name,
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

type RowByTeamItem = {
  id: number;
  display_id: number;
  contact_name: string | null;
  inbox_name: string | null;
  team_name: string | null;
  assignee_name: string | null;
  status: number;
  created_at: Date;
  last_activity_at: Date;
};

/**
 * Drill-down de departamento (incluindo bucket "Sem departamento" quando teamId=null).
 *
 * v0.42 canonical "active": coorte = `c.last_activity_at ∈ período + status
 * IN (0, 2, 3)` (alinhada com o card "Por departamento" que filtra por
 * conversas com movimento no período).
 */
export async function getByTeamDrillDown(
  connectionId: string,
  args: {
    accountId: number;
    period: { start: Date; end: Date };
    /** null = bucket "Sem departamento" */
    teamId: number | null;
    excludeMatrixIA?: boolean;
    ttlSeconds?: number;
  },
) {
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
    name: "dashboard-drill-by-team-canonical-v0.42",
    accountId: args.accountId,
    filtersHash: hashFilters(filtersForHash),
  });

  return withCache<ByTeamDrillDownData>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ByTeamDrillDownData>(
        async () => {
          // canonical "active" — coorte = last_activity_at ∈ período +
          // status IN (open, pending, snoozed). matrixClause via helper canônico.
          const matrixHelper = chatwootMatrixIaClause(excludeMatrixIA);
          const matrixClause = matrixHelper ? ` ${matrixHelper}` : "";
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
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status IN (0, 2, 3)
              ${teamClause}
              ${matrixClause}
          `;

          const sqlByStatus = `
            SELECT c.status, COUNT(*)::bigint AS total
            FROM conversations c
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
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
              t.name AS team_name,
              u.name AS assignee_name,
              c.status,
              c.created_at,
              c.last_activity_at
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes i ON i.id = c.inbox_id
            LEFT JOIN teams t ON t.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.account_id = $1
              AND c.last_activity_at >= $2
              AND c.last_activity_at < $3
              AND c.status IN (0, 2, 3)
              ${teamClause}
              ${matrixClause}
            ORDER BY c.last_activity_at DESC NULLS LAST
            LIMIT 100
          `;

          const [totalRes, byStatusRes, listRes] = await Promise.all([
            queryNexusChat<{ total: string; team_name: string | null }>(
              connectionId,
              sqlTotalAndName,
              params,
            ),
            queryNexusChat<RowStatus>(connectionId, sqlByStatus, params),
            queryNexusChat<RowByTeamItem>(connectionId, sqlList, params),
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
              teamName: r.team_name,
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
