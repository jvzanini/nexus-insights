/**
 * Lista paginada de conversas com JOINs para contact, inbox (estado),
 * team (departamento) e users (atendente). Inclui:
 *  - `identifier` e `additional_attributes` do contato (para detecção de CPF/CNPJ).
 *  - `custom_attributes` da conversa (jsonb, para tooltip/colunas opcionais).
 *  - `created_at` da conversa e `last_activity_at`.
 *  - `last_message_type`, `last_message_at`, `last_incoming_at`, `last_outgoing_at`
 *    derivados das 3 CTEs canônicas (`@canonical` em `src/lib/reports/canonical.ts`).
 *  - `waiting_seconds` (tempo sem resposta) e `open_seconds` (tempo aberta sem
 *    novo movimento) calculados via `EXTRACT(EPOCH FROM ...)` no Postgres.
 *  - Labels (taggings + tags) agregadas em JSON.
 *  - Cursor pagination por (last_activity_at DESC, id DESC).
 *
 * @canonical periodColumn=active (default em buildBaseFilter — c.last_activity_at)
 * @canonical CTEs last_classification_msg + last_incoming_public_msg + last_outgoing_any_msg
 *
 * Classificação (incoming vs outgoing) inclui notas privadas do agente como
 * "movimento outgoing" — fecha gap onde uma incoming pública seguida de nota
 * privada do agente apareceria como `waiting` (deveria ser `open`). Já o
 * `waiting_seconds` continua usando o timestamp da última msg pública incoming
 * (cliente real falou pela última vez), e `open_seconds` usa a última outgoing
 * (privada ou pública, agente movimentou pela última vez).
 *
 * Pode ser usada tanto em modo "live" quanto histórico — caller decide TTL.
 */

import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";
import {
  buildLastClassificationMsgCte,
  buildLastIncomingPublicMsgCte,
  buildLastOutgoingAnyMsgCte,
  STATUS_RESOLVED,
  MSG_INCOMING,
  MSG_OUTGOING,
} from "@/lib/reports/canonical";

export interface ConversaLabel {
  name: string;
  color: string;
}

export interface ConversaRow {
  id: number;
  display_id: number;
  contact: {
    id: number | null;
    name: string | null;
    phone_number: string | null;
    identifier: string | null;
    additional_attributes: Record<string, unknown> | null;
  };
  inbox: { id: number; name: string | null };
  team: { id: number | null; name: string | null };
  assignee: { id: number | null; name: string | null };
  status: number;
  priority: number | null;
  /** Criação da conversa (ISO). */
  created_at: string | null;
  /** Última atividade (ISO). */
  last_activity_at: string | null;
  /**
   * message_type da última msg classificadora (0=incoming pública, 1=outgoing
   * qualquer privacidade) ou null. Vem de `last_classification_msg` (lcm).
   */
  last_message_type: number | null;
  /** ISO da última msg classificadora (lcm.msg_created_at). */
  last_message_at: string | null;
  /** ISO da última msg incoming PÚBLICA (lipm.msg_created_at). */
  last_incoming_at: string | null;
  /** ISO da última msg outgoing (qualquer privacidade — loam.msg_created_at). */
  last_outgoing_at: string | null;
  /** custom_attributes (jsonb) da conversa. */
  custom_attributes: Record<string, unknown> | null;
  /**
   * Tempo, em segundos, em que a conversa está sem resposta.
   * - resolvida (status=1): null.
   * - aberta + classificação incoming (lcm.message_type=0): now() - lipm.msg_created_at.
   * - caso contrário: null.
   * @canonical last_incoming_public_msg
   */
  waiting_seconds: number | null;
  /**
   * Tempo, em segundos, em que a conversa está aberta aguardando o cliente.
   * - resolvida (status=1): null.
   * - aberta + classificação outgoing (lcm.message_type=1): now() - loam.msg_created_at.
   * - caso contrário: null.
   * @canonical last_outgoing_any_msg
   */
  open_seconds: number | null;
  labels: ConversaLabel[];
}

export interface ConversasListResult {
  rows: ConversaRow[];
  nextCursor: string | null;
  total: number;
  page: number;
  pageSize: number;
}

export interface ConversasListCursor {
  /** ISO string. */
  lastActivityAt: string;
  id: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50_000;
const DEFAULT_TTL_SECONDS = 30;

interface RawRow {
  id: number;
  display_id: number;
  status: number;
  priority: number | null;
  conversation_created_at: Date | null;
  last_activity_at: Date | null;
  contact_id: number | null;
  contact_name: string | null;
  contact_phone_number: string | null;
  contact_identifier: string | null;
  contact_additional_attributes: Record<string, unknown> | null;
  inbox_id: number;
  inbox_name: string | null;
  team_id: number | null;
  team_name: string | null;
  assignee_id: number | null;
  assignee_name: string | null;
  custom_attributes: Record<string, unknown> | null;
  last_message_type: number | null;
  last_message_at: Date | null;
  last_incoming_at: Date | null;
  last_outgoing_at: Date | null;
  waiting_seconds: string | number | null;
  open_seconds: string | number | null;
  labels: ConversaLabel[] | null;
  // Index signature exigida por `queryNexusChat<T extends Record<string, unknown>>`.
  [key: string]: unknown;
}

function encodeCursor(c: ConversasListCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string): ConversasListCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as ConversasListCursor;
    if (
      typeof parsed.lastActivityAt === "string" &&
      typeof parsed.id === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function toNumberOrNull(v: string | number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function conversasList(args: {
  /**
   * v0.37 (Fase 1 multi-tenant): UUID da `nexus_chat_connection` ativa.
   * Resolvido via `getActiveConnectionId(user)` no caller. É a origem do
   * Postgres de leitura — todas as queries vão para esse pool dinâmico.
   */
  connectionId: string;
  accountId: number;
  filters: ReportFilters;
  limit?: number;
  cursor?: string | null;
  page?: number;
  pageSize?: number;
  /** Define TTL e nomeação de cache. */
  cacheScope?: "live" | "historical";
  ttlSeconds?: number;
}) {
  const useOffset = args.page != null;
  const effectivePage = useOffset ? Math.max(1, args.page!) : 1;
  const effectivePageSize = useOffset
    ? Math.min(Math.max(args.pageSize ?? 1000, 10), MAX_LIMIT)
    : 0;
  const offset = useOffset ? (effectivePage - 1) * effectivePageSize : 0;
  const cursor = !useOffset && args.cursor ? decodeCursor(args.cursor) : null;
  const cacheScope = args.cacheScope ?? "live";
  const ttl =
    args.ttlSeconds ?? (cacheScope === "live" ? DEFAULT_TTL_SECONDS : 300);
  const limit = useOffset
    ? effectivePageSize
    : Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const key = cacheKey({
    scope: "report",
    name: useOffset
      ? `conversas-list-canonical-v0.42-${cacheScope}-p${effectivePage}s${effectivePageSize}`
      : `conversas-list-canonical-v0.42-${cacheScope}-${limit}-${cursor ? `${cursor.lastActivityAt}-${cursor.id}` : "first"}`,
    connectionId: args.connectionId,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<ConversasListResult>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ConversasListResult>(
        async () => {
          const base = buildBaseFilter(args.filters, args.accountId);
          const params: unknown[] = [...base.params];
          let p = params.length;

          // Snapshot dos params base (antes de cursor/offset/limit) — usado pra count.
          const baseAndSearchParams: unknown[] = [...params];

          let cursorClause = "";
          if (!useOffset && cursor) {
            cursorClause = ` AND (
              c.last_activity_at < $${++p}
              OR (c.last_activity_at = $${p} AND c.id < $${++p})
            )`;
            params.push(cursor.lastActivityAt);
            params.push(cursor.id);
          }

          let offsetClause = "";
          if (useOffset) {
            params.push(offset);
            offsetClause = ` OFFSET $${++p}`;
          }

          const limitParamIdx = ++p;
          params.push(useOffset ? limit : limit + 1);

          // v0.42 — 3 CTEs canônicas concatenadas:
          //  - last_classification_msg (lcm): incoming pública OU outgoing qualquer privacidade.
          //  - last_incoming_public_msg (lipm): apenas incoming pública (timestamp p/ waiting).
          //  - last_outgoing_any_msg (loam): apenas outgoing (timestamp p/ open).
          // A primeira mantém `WITH`; as 2 seguintes só `<nome> AS (...)` precedidas de vírgula.
          const ctesPrefix = `
            ${buildLastClassificationMsgCte()},
            ${buildLastIncomingPublicMsgCte().replace(/^\s*WITH\s+/, "")},
            ${buildLastOutgoingAnyMsgCte().replace(/^\s*WITH\s+/, "")}
          `;

          const sql = `
            ${ctesPrefix}
            SELECT
              c.id,
              c.display_id,
              c.status,
              c.priority,
              c.created_at AS conversation_created_at,
              c.last_activity_at,
              c.custom_attributes,
              ct.id AS contact_id,
              ct.name AS contact_name,
              ct.phone_number AS contact_phone_number,
              ct.identifier AS contact_identifier,
              ct.additional_attributes AS contact_additional_attributes,
              c.inbox_id,
              ix.name AS inbox_name,
              c.team_id,
              tm.name AS team_name,
              c.assignee_id,
              u.name AS assignee_name,
              lcm.message_type AS last_message_type,
              lcm.msg_created_at AS last_message_at,
              lipm.msg_created_at AS last_incoming_at,
              loam.msg_created_at AS last_outgoing_at,
              CASE
                WHEN c.status = ${STATUS_RESOLVED} THEN NULL
                WHEN lcm.message_type = ${MSG_INCOMING} THEN EXTRACT(EPOCH FROM (NOW() - lipm.msg_created_at))::int
                ELSE NULL
              END AS waiting_seconds,
              CASE
                WHEN c.status = ${STATUS_RESOLVED} THEN NULL
                WHEN lcm.message_type = ${MSG_OUTGOING} THEN EXTRACT(EPOCH FROM (NOW() - loam.msg_created_at))::int
                ELSE NULL
              END AS open_seconds,
              COALESCE(
                (
                  SELECT json_agg(json_build_object('name', t.name))
                  FROM taggings tg
                  JOIN tags t ON t.id = tg.tag_id
                  WHERE tg.taggable_id = c.id
                    AND tg.taggable_type = 'Conversation'
                ),
                '[]'::json
              ) AS labels
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            LEFT JOIN last_classification_msg lcm ON lcm.conversation_id = c.id
            LEFT JOIN last_incoming_public_msg lipm ON lipm.conversation_id = c.id
            LEFT JOIN last_outgoing_any_msg loam ON loam.conversation_id = c.id
            WHERE ${base.whereSql}${cursorClause}
            ORDER BY c.last_activity_at DESC NULLS LAST, c.id DESC
            ${offsetClause}
            LIMIT $${limitParamIdx}
          `;

          const countSql = useOffset
            ? `
            SELECT COUNT(*)::text AS total
            FROM conversations c
            LEFT JOIN contacts ct ON ct.id = c.contact_id
            LEFT JOIN inboxes ix ON ix.id = c.inbox_id
            LEFT JOIN teams tm ON tm.id = c.team_id
            LEFT JOIN users u ON u.id = c.assignee_id
            WHERE ${base.whereSql}
          `
            : null;

          const [result, countResult] = useOffset
            ? await Promise.all([
                queryNexusChat<RawRow>(args.connectionId, sql, params),
                queryNexusChat<{ total: string }>(
                  args.connectionId,
                  countSql!,
                  baseAndSearchParams,
                ),
              ])
            : ([
                await queryNexusChat<RawRow>(args.connectionId, sql, params),
                null,
              ] as const);
          const hasMore = !useOffset && result.rows.length > limit;
          const sliced = hasMore ? result.rows.slice(0, limit) : result.rows;

          const rows: ConversaRow[] = sliced.map((r) => ({
            id: r.id,
            display_id: r.display_id,
            contact: {
              id: r.contact_id,
              name: r.contact_name,
              phone_number: r.contact_phone_number,
              identifier: r.contact_identifier,
              additional_attributes: r.contact_additional_attributes,
            },
            inbox: { id: r.inbox_id, name: r.inbox_name },
            team: { id: r.team_id, name: r.team_name },
            assignee: { id: r.assignee_id, name: r.assignee_name },
            status: r.status,
            priority: r.priority,
            created_at: r.conversation_created_at
              ? r.conversation_created_at.toISOString()
              : null,
            last_activity_at: r.last_activity_at
              ? r.last_activity_at.toISOString()
              : null,
            last_message_type: r.last_message_type,
            last_message_at: r.last_message_at
              ? r.last_message_at.toISOString()
              : null,
            last_incoming_at: r.last_incoming_at
              ? r.last_incoming_at.toISOString()
              : null,
            last_outgoing_at: r.last_outgoing_at
              ? r.last_outgoing_at.toISOString()
              : null,
            custom_attributes: r.custom_attributes,
            waiting_seconds: toNumberOrNull(r.waiting_seconds),
            open_seconds: toNumberOrNull(r.open_seconds),
            labels: Array.isArray(r.labels) ? r.labels : [],
          }));

          let nextCursor: string | null = null;
          if (hasMore) {
            const last = sliced[sliced.length - 1];
            if (last && last.last_activity_at) {
              nextCursor = encodeCursor({
                lastActivityAt: last.last_activity_at.toISOString(),
                id: last.id,
              });
            }
          }

          const total =
            useOffset && countResult
              ? Number(countResult.rows[0]?.total ?? "0")
              : 0;

          return {
            rows,
            nextCursor,
            total,
            page: effectivePage,
            pageSize: effectivePageSize,
          };
        },
        { fallbackKey: key },
      ),
  });
}
