/**
 * Lista de conversas em aberto cuja última mensagem classificadora foi do
 * contato (incoming pública), ordenadas pelo tempo de espera (mais antigas
 * primeiro).
 *
 * @canonical periodColumn=active (default em buildBaseFilter — c.last_activity_at)
 * @canonical CTE last_classification_msg
 *
 * Cohort canônica:
 *  - `c.status = 0` (aberta)
 *  - última mensagem classificadora é `incoming` (lcm.message_type = 0)
 *    via CTE `last_classification_msg` — descarta notas privadas do agente
 *    como "atividade outgoing", então conversas com nota privada do agente
 *    NÃO entram aqui (são "abertas há", não "sem resposta").
 *  - `c.last_activity_at` ∈ período (quando filtro de período presente).
 *
 * KPIs do topo (total / tempo médio / mais antigo) e tabela usam a MESMA
 * cohort — derivam exatamente do mesmo SQL com WHERE idêntico.
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
import {
  buildLastClassificationMsgCte,
  STATUS_OPEN,
  MSG_INCOMING,
} from "@/lib/reports/canonical";

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
    filters: ReportFilters;
    limit?: number;
  },
) {
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const key = cacheKey({
    scope: "report",
    name: `mensagens-nao-respondidas-canonical-v0.42-${limit}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<MensagensNaoRespondidasResult>({
    key,
    ttlSeconds: TTL_SECONDS,
    fetcher: () =>
      withChatwootResilience<MensagensNaoRespondidasResult>(
        async () => {
          // periodColumn default 'active' (canonical) — c.last_activity_at
          const base = buildBaseFilter(args.filters, args.accountId);
          const params = [...base.params];
          const limitIdx = params.length + 1;
          params.push(limit);

          const sqlList = `
            ${buildLastClassificationMsgCte()}
            SELECT
              c.id,
              c.display_id,
              ct.name AS contact_name,
              ct.phone_number AS contact_phone,
              ix.name AS inbox_name,
              tm.name AS team_name,
              u.name AS assignee_name,
              lcm.msg_created_at AS last_incoming_at,
              EXTRACT(EPOCH FROM (NOW() - lcm.msg_created_at))::int AS waiting_seconds,
              (
                SELECT m2.content
                FROM messages m2
                WHERE m2.conversation_id = c.id
                  AND m2.created_at = lcm.msg_created_at
                  AND m2.message_type = ${MSG_INCOMING}
                  AND m2.private = FALSE
                LIMIT 1
              ) AS snippet
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE c.status = ${STATUS_OPEN} AND ${base.whereSql}
            ORDER BY waiting_seconds DESC
            LIMIT $${limitIdx}
          `;

          const sqlAgg = `
            ${buildLastClassificationMsgCte()}
            SELECT
              COUNT(*)::int AS total,
              COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - lcm.msg_created_at))), 0)::int AS avg_waiting_seconds,
              COALESCE(MAX(EXTRACT(EPOCH FROM (NOW() - lcm.msg_created_at))), 0)::int AS oldest_waiting_seconds
            FROM conversations c
            JOIN last_classification_msg lcm
              ON lcm.conversation_id = c.id
             AND lcm.message_type = ${MSG_INCOMING}
            WHERE c.status = ${STATUS_OPEN} AND ${base.whereSql}
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
