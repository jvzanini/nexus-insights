/**
 * Camada de leitura das tabelas de pré-agregação (facts).
 *
 * Lê do Postgres interno via pgPool.query (raw SQL — NÃO usa Prisma client
 * para manter o path de leitura leve). NÃO usa chatwootQuery.
 */

import { z } from "zod";
import { pgPool } from "@/lib/pg-pool";

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type FactsDimension = "by_account" | "by_inbox" | "by_agent" | "by_team";

export interface FactsDailyRow {
  bucketDate: string; // ISO date "YYYY-MM-DD"
  accountId: number;
  /** Only set when dimension !== "by_account". */
  dimensionId?: number;
  received: number;
  resolved: number;
  openAtEod: number;
  pendingAtEod: number;
  messagesIn: number;
  messagesOut: number;
  uniqueContacts: number;
  frtP50Seconds: number | null;
  frtP90Seconds: number | null;
  rtP50Seconds: number | null;
}

export interface FactsHourlyRow {
  bucketDate: string; // ISO date
  bucketHour: number; // 0-23
  accountId: number;
  received: number;
  resolved: number;
  messagesIn: number;
  messagesOut: number;
  uniqueContacts: number;
}

export interface FactsMeta {
  dimension: string;
  accountId: number;
  lastRefreshAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  oldestBucketDate: string | null;
  newestBucketDate: string | null;
  /** Computed: seconds since lastRefreshAt; null if never refreshed. */
  lagSeconds: number | null;
  /** Derived: "fresh" (<10min), "stale" (10-30min), "lagging" (>30min), "never" (lastRefreshAt null). */
  status: "fresh" | "stale" | "lagging" | "never";
}

// ---------------------------------------------------------------------------
// Schemas de validação Zod
// ---------------------------------------------------------------------------

const ReadFactsDailyArgsSchema = z
  .object({
    accountId: z.number().int().positive(),
    start: z.date(),
    end: z.date(),
    dimension: z
      .enum(["by_account", "by_inbox", "by_agent", "by_team"])
      .default("by_account"),
    dimensionIds: z.array(z.number().int().positive()).optional(),
    excludeMatrixIA: z.boolean().optional(),
  })
  .refine((d) => d.end >= d.start, {
    message: "end deve ser maior ou igual a start",
    path: ["end"],
  });

export type ReadFactsDailyArgs = z.input<typeof ReadFactsDailyArgsSchema>;

const ReadFactsHourlyArgsSchema = z
  .object({
    accountId: z.number().int().positive(),
    start: z.date(),
    end: z.date(),
    excludeMatrixIA: z.boolean().optional(),
  })
  .refine((d) => d.end >= d.start, {
    message: "end deve ser maior ou igual a start",
    path: ["end"],
  });

export type ReadFactsHourlyArgs = z.input<typeof ReadFactsHourlyArgsSchema>;

const ReadFactsMetaArgsSchema = z.object({
  accountId: z.number().int().positive(),
  dimension: z.string().optional(),
});

export type ReadFactsMetaArgs = z.input<typeof ReadFactsMetaArgsSchema>;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toIsoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function tableForDimension(dimension: FactsDimension): string {
  switch (dimension) {
    case "by_account":
      return "chatwoot_facts_daily_by_account";
    case "by_inbox":
      return "chatwoot_facts_daily_by_inbox";
    case "by_agent":
      return "chatwoot_facts_daily_by_agent";
    case "by_team":
      return "chatwoot_facts_daily_by_team";
  }
}

function dimensionColumn(dimension: FactsDimension): string {
  switch (dimension) {
    case "by_inbox":
      return "inbox_id";
    case "by_agent":
      return "agent_id";
    case "by_team":
      return "team_id";
    default:
      return "";
  }
}

interface RawDailyRow {
  bucket_date: unknown;
  account_id: number;
  dimension_id?: number;
  received: number;
  resolved: number;
  open_at_eod: number;
  pending_at_eod: number;
  messages_in: number;
  messages_out: number;
  unique_contacts: number;
  frt_p50_seconds: number | null;
  frt_p90_seconds: number | null;
  rt_p50_seconds: number | null;
}

function mapDailyRow(row: RawDailyRow, dimension: FactsDimension): FactsDailyRow {
  const out: FactsDailyRow = {
    bucketDate: toIsoDate(row.bucket_date),
    accountId: row.account_id,
    received: Number(row.received),
    resolved: Number(row.resolved),
    openAtEod: Number(row.open_at_eod),
    pendingAtEod: Number(row.pending_at_eod),
    messagesIn: Number(row.messages_in),
    messagesOut: Number(row.messages_out),
    uniqueContacts: Number(row.unique_contacts),
    frtP50Seconds: row.frt_p50_seconds !== null ? Number(row.frt_p50_seconds) : null,
    frtP90Seconds: row.frt_p90_seconds !== null ? Number(row.frt_p90_seconds) : null,
    rtP50Seconds: row.rt_p50_seconds !== null ? Number(row.rt_p50_seconds) : null,
  };
  if (dimension !== "by_account" && row.dimension_id !== undefined) {
    out.dimensionId = Number(row.dimension_id);
  }
  return out;
}

// ---------------------------------------------------------------------------
// readFactsDaily
// ---------------------------------------------------------------------------

export async function readFactsDaily(args: ReadFactsDailyArgs): Promise<FactsDailyRow[]> {
  const parsed = ReadFactsDailyArgsSchema.parse(args);
  const { accountId, start, end, dimension, dimensionIds, excludeMatrixIA } = parsed;

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  if (dimension === "by_account") {
    if (excludeMatrixIA) {
      // Subtrai a contribuição do inbox 31 (Matrix IA) via LEFT JOIN.
      // Nota: percentis NÃO são subtraídos — subtração de percentis é
      // estatisticamente inválida. Aceita-se a aproximação quando Matrix IA
      // é excluída: os percentis refletem o universo completo.
      const sql = `
        SELECT
          a.bucket_date,
          a.account_id,
          GREATEST(a.received    - COALESCE(i.received,    0), 0) AS received,
          GREATEST(a.resolved    - COALESCE(i.resolved,    0), 0) AS resolved,
          GREATEST(a.open_at_eod - COALESCE(i.open_at_eod, 0), 0) AS open_at_eod,
          GREATEST(a.pending_at_eod - COALESCE(i.pending_at_eod, 0), 0) AS pending_at_eod,
          GREATEST(a.messages_in  - COALESCE(i.messages_in,  0), 0) AS messages_in,
          GREATEST(a.messages_out - COALESCE(i.messages_out, 0), 0) AS messages_out,
          GREATEST(a.unique_contacts - COALESCE(i.unique_contacts, 0), 0) AS unique_contacts,
          a.frt_p50_seconds,
          a.frt_p90_seconds,
          a.rt_p50_seconds
        FROM chatwoot_facts_daily_by_account a
        LEFT JOIN chatwoot_facts_daily_by_inbox i
          ON  i.account_id = a.account_id
          AND i.bucket_date = a.bucket_date
          AND i.inbox_id = 31
        WHERE a.account_id = $1
          AND a.bucket_date BETWEEN $2 AND $3
        ORDER BY a.bucket_date ASC
      `;
      const result = await pgPool.query<RawDailyRow>(sql, [accountId, startDate, endDate]);
      return result.rows.map((r) => mapDailyRow(r, "by_account"));
    }

    // Consulta simples sem exclusão
    const sql = `
      SELECT
        bucket_date,
        account_id,
        received,
        resolved,
        open_at_eod,
        pending_at_eod,
        messages_in,
        messages_out,
        unique_contacts,
        frt_p50_seconds,
        frt_p90_seconds,
        rt_p50_seconds
      FROM chatwoot_facts_daily_by_account
      WHERE account_id = $1
        AND bucket_date BETWEEN $2 AND $3
      ORDER BY bucket_date ASC
    `;
    const result = await pgPool.query<RawDailyRow>(sql, [accountId, startDate, endDate]);
    return result.rows.map((r) => mapDailyRow(r, "by_account"));
  }

  // Dimensões com coluna específica (by_inbox, by_agent, by_team)
  const table = tableForDimension(dimension);
  const dimCol = dimensionColumn(dimension);

  const params: unknown[] = [accountId, startDate, endDate];
  let anyFilter = "";

  if (dimensionIds && dimensionIds.length > 0) {
    params.push(dimensionIds);
    anyFilter = `AND ${dimCol} = ANY($${params.length})`;
  }

  // excludeMatrixIA no by_inbox: exclui inbox_id=31
  // Para by_agent/by_team o flag não tem significado semântico claro — no-op
  // (comentário no código; a tabela não contém inbox_id para filtrar).
  let matrixFilter = "";
  if (excludeMatrixIA && dimension === "by_inbox") {
    matrixFilter = "AND inbox_id <> 31";
  }

  const sql = `
    SELECT
      bucket_date,
      account_id,
      ${dimCol} AS dimension_id,
      received,
      resolved,
      open_at_eod,
      pending_at_eod,
      messages_in,
      messages_out,
      unique_contacts,
      frt_p50_seconds,
      frt_p90_seconds,
      rt_p50_seconds
    FROM ${table}
    WHERE account_id = $1
      AND bucket_date BETWEEN $2 AND $3
      ${anyFilter}
      ${matrixFilter}
    ORDER BY bucket_date ASC
  `;

  const result = await pgPool.query<RawDailyRow>(sql, params);
  return result.rows.map((r) => mapDailyRow(r, dimension));
}

// ---------------------------------------------------------------------------
// readFactsHourly
// ---------------------------------------------------------------------------

interface RawHourlyRow {
  bucket_date: unknown;
  bucket_hour: number;
  account_id: number;
  received: number;
  resolved: number;
  messages_in: number;
  messages_out: number;
  unique_contacts: number;
}

export async function readFactsHourly(args: ReadFactsHourlyArgs): Promise<FactsHourlyRow[]> {
  const parsed = ReadFactsHourlyArgsSchema.parse(args);
  const { accountId, start, end } = parsed;

  // excludeMatrixIA é no-op aqui — não há tabela hourly-by-inbox para subtrair.
  // Aceita-se a limitação; o dado horário reflete o universo completo de inboxes.

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const sql = `
    SELECT
      bucket_date,
      bucket_hour,
      account_id,
      received,
      resolved,
      messages_in,
      messages_out,
      unique_contacts
    FROM chatwoot_facts_hourly_by_account
    WHERE account_id = $1
      AND bucket_date BETWEEN $2 AND $3
    ORDER BY bucket_date ASC, bucket_hour ASC
  `;

  const result = await pgPool.query<RawHourlyRow>(sql, [accountId, startDate, endDate]);
  return result.rows.map((r) => ({
    bucketDate: toIsoDate(r.bucket_date),
    bucketHour: Number(r.bucket_hour),
    accountId: r.account_id,
    received: Number(r.received),
    resolved: Number(r.resolved),
    messagesIn: Number(r.messages_in),
    messagesOut: Number(r.messages_out),
    uniqueContacts: Number(r.unique_contacts),
  }));
}

// ---------------------------------------------------------------------------
// readFactsMeta
// ---------------------------------------------------------------------------

interface RawMetaRow {
  dimension: string;
  account_id: number;
  last_refresh_at: Date | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  oldest_bucket_date: unknown;
  newest_bucket_date: unknown;
}

function computeMetaStatus(lagSeconds: number | null): FactsMeta["status"] {
  if (lagSeconds === null) return "never";
  if (lagSeconds < 600) return "fresh";
  if (lagSeconds < 1800) return "stale";
  return "lagging";
}

export async function readFactsMeta(args: ReadFactsMetaArgs): Promise<FactsMeta[]> {
  const parsed = ReadFactsMetaArgsSchema.parse(args);
  const { accountId, dimension } = parsed;

  const params: unknown[] = [accountId];
  let dimFilter = "";

  if (dimension) {
    params.push(dimension);
    dimFilter = `AND dimension = $${params.length}`;
  }

  const sql = `
    SELECT
      dimension,
      account_id,
      last_refresh_at,
      last_attempt_at,
      last_error,
      oldest_bucket_date,
      newest_bucket_date
    FROM chatwoot_facts_meta
    WHERE account_id = $1
      ${dimFilter}
    ORDER BY dimension ASC
  `;

  const result = await pgPool.query<RawMetaRow>(sql, params);

  return result.rows.map((r) => {
    const lastRefreshAt = r.last_refresh_at ? new Date(r.last_refresh_at) : null;
    const lagSeconds =
      lastRefreshAt !== null
        ? Math.floor((Date.now() - lastRefreshAt.getTime()) / 1000)
        : null;

    return {
      dimension: r.dimension,
      accountId: r.account_id,
      lastRefreshAt,
      lastAttemptAt: r.last_attempt_at ? new Date(r.last_attempt_at) : null,
      lastError: r.last_error,
      oldestBucketDate: r.oldest_bucket_date ? toIsoDate(r.oldest_bucket_date) : null,
      newestBucketDate: r.newest_bucket_date ? toIsoDate(r.newest_bucket_date) : null,
      lagSeconds,
      status: computeMetaStatus(lagSeconds),
    };
  });
}
