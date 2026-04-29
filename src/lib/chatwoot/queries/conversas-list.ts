/**
 * Lista paginada de conversas com JOINs para contact, inbox (estado),
 * team (departamento) e users (atendente). Inclui:
 *  - `identifier` e `additional_attributes` do contato (para detecção de CPF/CNPJ).
 *  - Labels (taggings + tags) agregadas em JSON.
 *  - Cursor pagination por (last_activity_at DESC, id DESC).
 *
 * Pode ser usada tanto em modo "live" quanto histórico — caller decide TTL.
 */

import { getChatwootPool } from "../pool";
import { withChatwootResilience } from "../resilience";
import { withCache } from "@/lib/cache/pull-through";
import { cacheKey, hashFilters } from "@/lib/cache/keys";
import { buildBaseFilter, type ReportFilters } from "../filters";

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
  last_activity_at: string | null;
  labels: ConversaLabel[];
}

export interface ConversasListResult {
  rows: ConversaRow[];
  nextCursor: string | null;
}

export interface ConversasListCursor {
  /** ISO string. */
  lastActivityAt: string;
  id: number;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_TTL_SECONDS = 30;

interface RawRow {
  id: number;
  display_id: number;
  status: number;
  priority: number | null;
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
  labels: ConversaLabel[] | null;
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

export async function conversasList(args: {
  accountId: number;
  filters: ReportFilters;
  limit?: number;
  cursor?: string | null;
  /** Define TTL e nomeação de cache. */
  cacheScope?: "live" | "historical";
  ttlSeconds?: number;
}) {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), 200);
  const cursor = args.cursor ? decodeCursor(args.cursor) : null;
  const cacheScope = args.cacheScope ?? "live";
  const ttl =
    args.ttlSeconds ?? (cacheScope === "live" ? DEFAULT_TTL_SECONDS : 300);

  const key = cacheKey({
    scope: "report",
    name: `conversas-list-${cacheScope}-${limit}-${cursor ? `${cursor.lastActivityAt}-${cursor.id}` : "first"}`,
    accountId: args.accountId,
    filtersHash: hashFilters(args.filters),
  });

  return withCache<ConversasListResult>({
    key,
    ttlSeconds: ttl,
    fetcher: () =>
      withChatwootResilience<ConversasListResult>(
        async () => {
          const pool = getChatwootPool();
          const base = buildBaseFilter(args.filters, args.accountId);
          const params: unknown[] = [...base.params];
          let p = params.length;

          const cursorClause = cursor
            ? ` AND (
                c.last_activity_at < $${++p}
                OR (c.last_activity_at = $${p} AND c.id < $${++p})
              )`
            : "";
          if (cursor) {
            params.push(cursor.lastActivityAt);
            params.push(cursor.id);
          }

          const limitParamIdx = ++p;
          params.push(limit + 1); // pega 1 a mais para detectar nextCursor.

          const sql = `
            SELECT
              c.id,
              c.display_id,
              c.status,
              c.priority,
              c.last_activity_at,
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
              COALESCE(
                (
                  SELECT json_agg(json_build_object('name', t.name, 'color', t.color))
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
            WHERE ${base.whereSql}${cursorClause}
            ORDER BY c.last_activity_at DESC NULLS LAST, c.id DESC
            LIMIT $${limitParamIdx}
          `;

          const result = await pool.query<RawRow>(sql, params);
          const hasMore = result.rows.length > limit;
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
            last_activity_at: r.last_activity_at
              ? r.last_activity_at.toISOString()
              : null,
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

          return { rows, nextCursor };
        },
        { fallbackKey: key },
      ),
  });
}
