/**
 * Lista de conversas em aberto cuja última mensagem foi do contato (incoming),
 * ordenadas pelo tempo de espera (mais antigas primeiro).
 *
 * Esta tela é "estado atual" — desconsidera o filtro de período.
 * KPIs derivados (total / tempo médio / mais antigo) são consultados
 * em uma agregação separada para refletir todo o universo elegível.
 *
 * TTL curto (30s) — atualiza próximo do tempo real.
 *
 * Multi-tenant: recebe `connectionId` (UUID da `nexus_chat_connection`) como
 * primeiro parâmetro e roteia via `queryNexusChat` para o pool dinâmico
 * correspondente. Caller (Server Action) resolve via `getActiveConnectionId`.
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

export interface MensagemNaoRespondidaRow {
  id: number;
  display_id: number;
  contact_name: string | null;
  contact_phone: string | null;
  inbox_name: string | null;
  team_name: string | null;
  assignee_name: string | null;
  last_incoming_at: string;
  waiting_seconds: number;
  snippet: string | null;
}

export interface MensagensNaoRespondidasResult {
  rows: MensagemNaoRespondidaRow[];
  total: number;
  avgWaitingSeconds: number;
  oldestWaitingSeconds: number;
}

type RawListRow = {
  id: number;
  display_id: number;
  contact_name: string | null;
  contact_phone: string | null;
  inbox_name: string | null;
  team_name: string | null;
  assignee_name: string | null;
  last_incoming_at: Date | string;
  waiting_seconds: number;
  snippet: string | null;
} & Record<string, unknown>;

type RawAggRow = {
  total: number | string;
  avg_waiting_seconds: number | string;
  oldest_waiting_seconds: number | string;
} & Record<string, unknown>;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const TTL_SECONDS = 30;

export async function mensagensNaoRespondidas(
  connectionId: string,
  args: {
    accountId: number;
    /** `period` é ignorado — esta tela é "estado atual". */
    filters: ReportFilters;
    limit?: number;
  },
) {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  // Período é descartado: estado atual.
  const filtersNoPeriod: ReportFilters = { ...args.filters, period: undefined };

  const key = cacheKey({
    scope: "report",
    name: `mensagens-nao-respondidas-${limit}`,
    accountId: args.accountId,
    filtersHash: hashFilters(filtersNoPeriod),
  });

  return withCache<MensagensNaoRespondidasResult>({
    key,
    ttlSeconds: TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MensagensNaoRespondidasResult>(
        async () => {
          const base = buildBaseFilter(filtersNoPeriod, args.accountId);
          const params = [...base.params];
          const limitIdx = params.length + 1;
          params.push(limit);

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
              ct.phone_number AS contact_phone,
              ix.name AS inbox_name,
              tm.name AS team_name,
              u.name AS assignee_name,
              lm.created_at AS last_incoming_at,
              EXTRACT(EPOCH FROM (NOW() - lm.created_at))::int AS waiting_seconds,
              lm.content AS snippet
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.status = 0 AND ${base.whereSql}
            ORDER BY waiting_seconds DESC
            LIMIT $${limitIdx}
          `;

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
              COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lm.created_at))), 0)::int AS avg_waiting_seconds,
              COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - lm.created_at))), 0)::int AS oldest_waiting_seconds
            FROM conversations c
            JOIN last_msg lm
              ON lm.conversation_id = c.id
             AND lm.message_type = 0
            WHERE c.status = 0 AND ${base.whereSql}
          `;

          const [listRes, aggRes] = await Promise.all([
            queryNexusChat<RawListRow>(connectionId, sqlList, params),
            queryNexusChat<RawAggRow>(
              connectionId,
              sqlAgg,
              base.params as unknown[],
            ),
          ]);

          const rows: MensagemNaoRespondidaRow[] = listRes.rows.map((r) => ({
            id: r.id,
            display_id: r.display_id,
            contact_name: r.contact_name,
            contact_phone: r.contact_phone,
            inbox_name: r.inbox_name,
            team_name: r.team_name,
            assignee_name: r.assignee_name,
            last_incoming_at:
              r.last_incoming_at instanceof Date
                ? r.last_incoming_at.toISOString()
                : String(r.last_incoming_at),
            waiting_seconds: Number(r.waiting_seconds ?? 0),
            snippet: r.snippet,
          }));

          const agg = aggRes.rows[0] ?? {
            total: 0,
            avg_waiting_seconds: 0,
            oldest_waiting_seconds: 0,
          };

          return {
            rows,
            total: Number(agg.total ?? 0),
            avgWaitingSeconds: Number(agg.avg_waiting_seconds ?? 0),
            oldestWaitingSeconds: Number(agg.oldest_waiting_seconds ?? 0),
          };
        },
        { fallbackKey: key },
      ),
  });
}
