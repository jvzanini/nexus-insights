import "server-only";

/**
 * Executor das tools do Agente Nex.
 *
 * Recebe o nome da tool + argumentos JSON do modelo e executa SQL parametrizado
 * no Postgres do Chatwoot via `chatwootQuery` (que serializa as queries — o
 * usuário read-only tem CONNECTION LIMIT 5).
 *
 * Garantias:
 *  - Toda query inclui `account_id` como filtro obrigatório (multi-tenant).
 *  - Toda query exclui `inbox_id = 31` (Matrix IA) por default.
 *  - Resultados são limitados (LIMIT) para não estourar o contexto do LLM.
 *  - Erros são capturados e devolvidos como `{ result: null, error }` — o LLM
 *    decide como reagir (pedir reformulação, etc).
 */

import { chatwootQuery } from "@/lib/chatwoot/pool";
import { getPlatformTz, getPeriodInTz, type PeriodKey } from "@/lib/datetime";

const MATRIX_IA_INBOX_ID = 31;
const HARD_MAX_LIMIT = 200;

type Json = unknown;

export interface ToolExecutionResult {
  result: Json;
  error?: string;
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  accountId: number,
): Promise<ToolExecutionResult> {
  try {
    switch (name) {
      case "query_conversations":
        return { result: await queryConversations(args, accountId) };
      case "query_messages":
        return { result: await queryMessages(args, accountId) };
      case "query_users":
        return { result: await queryUsers(args, accountId) };
      case "query_contacts":
        return { result: await queryContacts(args, accountId) };
      case "aggregate_conversations":
        return { result: await aggregateConversations(args, accountId) };
      case "get_top_agents":
        return { result: await getTopAgents(args, accountId) };
      case "get_dashboard_summary":
        return { result: await getDashboardSummary(args, accountId) };
      default:
        return { result: null, error: `Ferramenta desconhecida: ${name}` };
    }
  } catch (err) {
    return {
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function clampLimit(raw: unknown, fallback: number): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), HARD_MAX_LIMIT);
}

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asInt(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
  }
  return fallback;
}

interface PeriodResolved {
  start: Date;
  end: Date;
}

/**
 * Resolve a string de período em range UTC, considerando timezone da plataforma.
 * Aceita strings amigáveis e também JSON {start, end}.
 */
async function resolvePeriod(
  raw: unknown,
): Promise<PeriodResolved | undefined> {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") return undefined;

  const value = raw.trim();
  if (!value) return undefined;

  // 1) Tentativa de parse JSON (range customizado)
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as { start?: string; end?: string };
      if (parsed.start && parsed.end) {
        const start = new Date(parsed.start);
        const end = new Date(parsed.end);
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { start, end };
        }
      }
    } catch {
      /* continua para resolução por keyword */
    }
  }

  const tz = await getPlatformTz();
  const lower = value.toLowerCase();

  switch (lower) {
    case "hoje":
      return getPeriodInTz("hoje" as PeriodKey, tz);
    case "ontem": {
      const today = getPeriodInTz("hoje" as PeriodKey, tz);
      const oneDay = 24 * 60 * 60 * 1000;
      return {
        start: new Date(today.start.getTime() - oneDay),
        end: new Date(today.end.getTime() - oneDay),
      };
    }
    case "semana_atual":
      return getPeriodInTz("semana_atual" as PeriodKey, tz);
    case "mes_atual":
      return getPeriodInTz("mes_atual" as PeriodKey, tz);
    case "mes_anterior": {
      const now = new Date();
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
      );
      const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      return { start, end };
    }
    case "7d": {
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    case "30d": {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start, end: now };
    }
    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Implementações                                                             */
/* -------------------------------------------------------------------------- */

async function queryConversations(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const status = asInt(args.status);
  const assigneeName = asString(args.assignee_name);
  const inboxName = asString(args.inbox_name);
  const teamName = asString(args.team_name);
  const limit = clampLimit(args.limit, 50);
  const countOnly = asBool(args.count_only, false);
  const period = await resolvePeriod(args.period);

  const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
  let p = 2;
  const where: string[] = [`c.account_id = $1`, `c.inbox_id <> $2`];

  if (status !== undefined) {
    where.push(`c.status = $${++p}`);
    params.push(status);
  }
  if (period) {
    where.push(`c.created_at >= $${++p}`);
    params.push(period.start);
    where.push(`c.created_at < $${++p}`);
    params.push(period.end);
  }
  if (assigneeName) {
    where.push(`u.name ILIKE $${++p}`);
    params.push(`%${assigneeName}%`);
  }
  if (inboxName) {
    where.push(`i.name ILIKE $${++p}`);
    params.push(`%${inboxName}%`);
  }
  if (teamName) {
    where.push(`t.name ILIKE $${++p}`);
    params.push(`%${teamName}%`);
  }

  if (countOnly) {
    const sql = `
      SELECT COUNT(*)::bigint AS total
      FROM conversations c
      LEFT JOIN users u ON u.id = c.assignee_id
      LEFT JOIN inboxes i ON i.id = c.inbox_id
      LEFT JOIN teams t ON t.id = c.team_id
      WHERE ${where.join(" AND ")}
    `;
    const rows = await chatwootQuery<{ total: string }>(sql, params);
    return { total: Number(rows[0]?.total ?? 0) };
  }

  const sql = `
    SELECT
      c.id,
      c.status,
      c.priority,
      c.created_at,
      c.last_activity_at,
      i.name AS inbox_name,
      t.name AS team_name,
      u.name AS assignee_name
    FROM conversations c
    LEFT JOIN users u ON u.id = c.assignee_id
    LEFT JOIN inboxes i ON i.id = c.inbox_id
    LEFT JOIN teams t ON t.id = c.team_id
    WHERE ${where.join(" AND ")}
    ORDER BY c.created_at DESC
    LIMIT $${++p}
  `;
  params.push(limit);

  const rows = await chatwootQuery<{
    id: number;
    status: number;
    priority: number | null;
    created_at: Date;
    last_activity_at: Date | null;
    inbox_name: string | null;
    team_name: string | null;
    assignee_name: string | null;
  }>(sql, params);

  return {
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      priority: r.priority,
      created_at: r.created_at?.toISOString?.() ?? null,
      last_activity_at: r.last_activity_at?.toISOString?.() ?? null,
      inbox_name: r.inbox_name,
      team_name: r.team_name,
      assignee_name: r.assignee_name,
    })),
  };
}

async function queryMessages(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const messageType = asInt(args.message_type);
  const conversationId = asInt(args.conversation_id);
  const period = await resolvePeriod(args.period);
  const countOnly = asBool(args.count_only, true);

  const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
  let p = 2;
  const where: string[] = [
    `c.account_id = $1`,
    `c.inbox_id <> $2`,
    `m.conversation_id = c.id`,
  ];

  if (messageType !== undefined) {
    where.push(`m.message_type = $${++p}`);
    params.push(messageType);
  }
  if (conversationId !== undefined) {
    where.push(`m.conversation_id = $${++p}`);
    params.push(conversationId);
  }
  if (period) {
    where.push(`m.created_at >= $${++p}`);
    params.push(period.start);
    where.push(`m.created_at < $${++p}`);
    params.push(period.end);
  }

  if (countOnly) {
    const sql = `
      SELECT COUNT(*)::bigint AS total
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE ${where.join(" AND ")}
    `;
    const rows = await chatwootQuery<{ total: string }>(sql, params);
    return { total: Number(rows[0]?.total ?? 0) };
  }

  const limit = clampLimit(args.limit, 50);
  const sql = `
    SELECT
      m.id,
      m.conversation_id,
      m.message_type,
      m.created_at,
      LEFT(m.content, 280) AS content_preview
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE ${where.join(" AND ")}
    ORDER BY m.created_at DESC
    LIMIT $${++p}
  `;
  params.push(limit);

  const rows = await chatwootQuery<{
    id: number;
    conversation_id: number;
    message_type: number;
    created_at: Date;
    content_preview: string | null;
  }>(sql, params);

  return {
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      conversation_id: r.conversation_id,
      message_type: r.message_type,
      created_at: r.created_at?.toISOString?.() ?? null,
      content_preview: r.content_preview,
    })),
  };
}

async function queryUsers(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const onlyActive = asBool(args.only_active, true);

  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      au.role,
      au.availability,
      au.created_at
    FROM users u
    JOIN account_users au ON au.user_id = u.id
    WHERE au.account_id = $1
    ${onlyActive ? "AND au.availability IN (0, 1, 2)" : ""}
    ORDER BY u.name ASC
    LIMIT 200
  `;

  const rows = await chatwootQuery<{
    id: number;
    name: string | null;
    email: string | null;
    role: number | null;
    availability: number | null;
    created_at: Date | null;
  }>(sql, [accountId]);

  return {
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      availability: r.availability,
      created_at: r.created_at?.toISOString?.() ?? null,
    })),
  };
}

async function queryContacts(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const search = asString(args.search);
  const limit = clampLimit(args.limit, 20);

  const params: unknown[] = [accountId];
  let p = 1;
  const where: string[] = [`co.account_id = $1`];

  if (search) {
    const term = `%${search}%`;
    where.push(
      `(co.name ILIKE $${++p} OR co.email ILIKE $${p} OR co.phone_number ILIKE $${p})`,
    );
    params.push(term);
  }

  const sql = `
    SELECT
      co.id,
      co.name,
      co.email,
      co.phone_number,
      co.created_at
    FROM contacts co
    WHERE ${where.join(" AND ")}
    ORDER BY co.created_at DESC
    LIMIT $${++p}
  `;
  params.push(limit);

  const rows = await chatwootQuery<{
    id: number;
    name: string | null;
    email: string | null;
    phone_number: string | null;
    created_at: Date | null;
  }>(sql, params);

  return {
    count: rows.length,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone_number: r.phone_number,
      created_at: r.created_at?.toISOString?.() ?? null,
    })),
  };
}

async function aggregateConversations(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const groupBy = asString(args.group_by) ?? "inbox";
  const agg = asString(args.agg) ?? "count";
  const status = asInt(args.status);
  const period = await resolvePeriod(args.period);
  const limit = clampLimit(args.limit, 10);

  let groupExpr: string;
  let labelExpr: string;
  let joinClause = "";

  switch (groupBy) {
    case "inbox":
      groupExpr = "i.id";
      labelExpr = "i.name";
      joinClause = "LEFT JOIN inboxes i ON i.id = c.inbox_id";
      break;
    case "team":
      groupExpr = "t.id";
      labelExpr = "t.name";
      joinClause = "LEFT JOIN teams t ON t.id = c.team_id";
      break;
    case "assignee":
      groupExpr = "u.id";
      labelExpr = "u.name";
      joinClause = "LEFT JOIN users u ON u.id = c.assignee_id";
      break;
    case "status":
      groupExpr = "c.status";
      labelExpr = "c.status::text";
      break;
    case "priority":
      groupExpr = "c.priority";
      labelExpr = "c.priority::text";
      break;
    case "day":
      groupExpr = "DATE_TRUNC('day', c.created_at)";
      labelExpr = "DATE_TRUNC('day', c.created_at)::text";
      break;
    case "hour":
      groupExpr = "EXTRACT(HOUR FROM c.created_at)";
      labelExpr = "EXTRACT(HOUR FROM c.created_at)::text";
      break;
    default:
      return { error: `group_by inválido: ${groupBy}` };
  }

  const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
  let p = 2;
  const where: string[] = [`c.account_id = $1`, `c.inbox_id <> $2`];
  if (status !== undefined) {
    where.push(`c.status = $${++p}`);
    params.push(status);
  }
  if (period) {
    where.push(`c.created_at >= $${++p}`);
    params.push(period.start);
    where.push(`c.created_at < $${++p}`);
    params.push(period.end);
  }

  if (agg === "count") {
    const sql = `
      SELECT ${labelExpr} AS label, COUNT(c.id)::bigint AS value
      FROM conversations c
      ${joinClause}
      WHERE ${where.join(" AND ")}
      GROUP BY ${groupExpr}, ${labelExpr}
      ORDER BY value DESC
      LIMIT $${++p}
    `;
    params.push(limit);
    const rows = await chatwootQuery<{ label: string | null; value: string }>(
      sql,
      params,
    );
    return {
      group_by: groupBy,
      agg,
      items: rows.map((r) => ({
        label: r.label ?? "(sem nome)",
        value: Number(r.value),
      })),
    };
  }

  if (agg === "avg_first_response_time") {
    // Usa reporting_events.name = 'first_response' (segundos).
    let periodReClause = "";
    const params2: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
    let pp = 2;
    if (period) {
      periodReClause += ` AND re.created_at >= $${++pp}`;
      params2.push(period.start);
      periodReClause += ` AND re.created_at < $${++pp}`;
      params2.push(period.end);
    }
    if (status !== undefined) {
      periodReClause += ` AND c.status = $${++pp}`;
      params2.push(status);
    }

    const sql = `
      SELECT ${labelExpr} AS label, AVG(re.value)::float AS value
      FROM reporting_events re
      JOIN conversations c ON c.id = re.conversation_id
      ${joinClause}
      WHERE re.account_id = $1
        AND c.inbox_id <> $2
        AND re.name = 'first_response'
        AND re.value IS NOT NULL
        ${periodReClause}
      GROUP BY ${groupExpr}, ${labelExpr}
      ORDER BY value ASC
      LIMIT $${++pp}
    `;
    params2.push(limit);
    const rows = await chatwootQuery<{
      label: string | null;
      value: number | null;
    }>(sql, params2);
    return {
      group_by: groupBy,
      agg,
      unit: "seconds",
      items: rows.map((r) => ({
        label: r.label ?? "(sem nome)",
        value: r.value !== null ? Math.round(Number(r.value)) : null,
      })),
    };
  }

  return { error: `agg inválido: ${agg}` };
}

async function getTopAgents(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const metric = asString(args.metric) ?? "fastest";
  const period = await resolvePeriod(args.period);
  const limit = clampLimit(args.limit, 5);

  if (metric === "fastest") {
    const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
    let p = 2;
    let periodClause = "";
    if (period) {
      periodClause += ` AND re.created_at >= $${++p}`;
      params.push(period.start);
      periodClause += ` AND re.created_at < $${++p}`;
      params.push(period.end);
    }
    const sql = `
      SELECT u.name, AVG(re.value)::float AS avg_seconds, COUNT(re.id)::bigint AS samples
      FROM reporting_events re
      JOIN conversations c ON c.id = re.conversation_id
      JOIN users u ON u.id = c.assignee_id
      WHERE re.account_id = $1
        AND c.inbox_id <> $2
        AND re.name = 'first_response'
        AND re.value IS NOT NULL
        ${periodClause}
      GROUP BY u.id, u.name
      HAVING COUNT(re.id) >= 3
      ORDER BY avg_seconds ASC
      LIMIT $${++p}
    `;
    params.push(limit);
    const rows = await chatwootQuery<{
      name: string | null;
      avg_seconds: number | null;
      samples: string;
    }>(sql, params);
    return {
      metric,
      unit: "seconds",
      items: rows.map((r) => ({
        name: r.name ?? "(sem nome)",
        avg_seconds: Math.round(Number(r.avg_seconds ?? 0)),
        samples: Number(r.samples ?? 0),
      })),
    };
  }

  // most_open / most_resolved → contagem de conversations.
  const targetStatus = metric === "most_resolved" ? 1 : 0;
  const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID, targetStatus];
  let p = 3;
  let periodClause = "";
  if (period) {
    // Para "resolved" usa last_activity_at (quando concluiu). Para "open" usa created_at.
    const col = metric === "most_resolved" ? "c.last_activity_at" : "c.created_at";
    periodClause += ` AND ${col} >= $${++p}`;
    params.push(period.start);
    periodClause += ` AND ${col} < $${++p}`;
    params.push(period.end);
  }

  const sql = `
    SELECT u.name, COUNT(c.id)::bigint AS total
    FROM conversations c
    JOIN users u ON u.id = c.assignee_id
    WHERE c.account_id = $1
      AND c.inbox_id <> $2
      AND c.status = $3
      ${periodClause}
    GROUP BY u.id, u.name
    ORDER BY total DESC
    LIMIT $${++p}
  `;
  params.push(limit);
  const rows = await chatwootQuery<{ name: string | null; total: string }>(
    sql,
    params,
  );
  return {
    metric,
    items: rows.map((r) => ({
      name: r.name ?? "(sem nome)",
      total: Number(r.total ?? 0),
    })),
  };
}

async function getDashboardSummary(
  args: Record<string, unknown>,
  accountId: number,
): Promise<Json> {
  const period =
    (await resolvePeriod(args.period)) ??
    (await resolvePeriod("hoje")) ??
    undefined;

  const params: unknown[] = [accountId, MATRIX_IA_INBOX_ID];

  // Em aberto, pendentes (snapshot agora — sem período)
  const sqlOpen = `
    SELECT COUNT(*)::bigint AS total FROM conversations c
    WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
  `;
  const sqlPending = `
    SELECT COUNT(*)::bigint AS total FROM conversations c
    WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 2
  `;

  // Resolvidas no período
  const paramsResolved: unknown[] = [accountId, MATRIX_IA_INBOX_ID];
  let pr = 2;
  let resolvedClause = "";
  if (period) {
    resolvedClause += ` AND c.last_activity_at >= $${++pr}`;
    paramsResolved.push(period.start);
    resolvedClause += ` AND c.last_activity_at < $${++pr}`;
    paramsResolved.push(period.end);
  }
  const sqlResolved = `
    SELECT COUNT(*)::bigint AS total FROM conversations c
    WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 1${resolvedClause}
  `;

  // Top inbox em aberto
  const sqlTopInbox = `
    SELECT i.name, COUNT(c.id)::bigint AS total
    FROM conversations c
    JOIN inboxes i ON i.id = c.inbox_id
    WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
    GROUP BY i.id, i.name
    ORDER BY total DESC
    LIMIT 1
  `;

  // Top atendente em aberto
  const sqlTopAgent = `
    SELECT u.name, COUNT(c.id)::bigint AS total
    FROM conversations c
    JOIN users u ON u.id = c.assignee_id
    WHERE c.account_id = $1 AND c.inbox_id <> $2 AND c.status = 0
    GROUP BY u.id, u.name
    ORDER BY total DESC
    LIMIT 1
  `;

  const [open, pending, resolved, topInbox, topAgent] = await Promise.all([
    chatwootQuery<{ total: string }>(sqlOpen, params),
    chatwootQuery<{ total: string }>(sqlPending, params),
    chatwootQuery<{ total: string }>(sqlResolved, paramsResolved),
    chatwootQuery<{ name: string | null; total: string }>(sqlTopInbox, params),
    chatwootQuery<{ name: string | null; total: string }>(sqlTopAgent, params),
  ]);

  return {
    em_aberto: Number(open[0]?.total ?? 0),
    pendentes: Number(pending[0]?.total ?? 0),
    resolvidas_no_periodo: Number(resolved[0]?.total ?? 0),
    top_inbox: topInbox[0]
      ? { name: topInbox[0].name ?? "(sem nome)", total: Number(topInbox[0].total) }
      : null,
    top_atendente: topAgent[0]
      ? { name: topAgent[0].name ?? "(sem nome)", total: Number(topAgent[0].total) }
      : null,
    period: period
      ? { start: period.start.toISOString(), end: period.end.toISOString() }
      : null,
  };
}
