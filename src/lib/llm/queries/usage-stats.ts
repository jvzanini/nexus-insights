import "server-only";

import { pgPool } from "@/lib/pg-pool";
import { ensureLlmTables } from "../ensure-tables";

const TZ = "America/Sao_Paulo";

export interface UsageSummary {
  totalCost: number;
  totalCostBrl: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCalls: number;
  byModel: Array<{
    provider: string;
    model: string;
    cost: number;
    costBrl: number;
    tokensInput: number;
    tokensOutput: number;
    calls: number;
  }>;
  byDay: Array<{
    /** Data ISO (yyyy-mm-dd) no fuso America/Sao_Paulo. */
    day: string;
    cost: number;
    costBrl: number;
    tokens: number;
    calls: number;
  }>;
  byProvider: Array<{
    provider: string;
    cost: number;
    costBrl: number;
    calls: number;
  }>;
}

interface SummaryRow {
  total_cost: string | number | null;
  total_cost_brl: string | number | null;
  total_tokens_input: string | number | null;
  total_tokens_output: string | number | null;
  total_calls: string | number | null;
}

interface ModelRow {
  provider: string;
  model: string;
  cost: string | number | null;
  cost_brl: string | number | null;
  tokens_input: string | number | null;
  tokens_output: string | number | null;
  calls: string | number | null;
}

interface DayRow {
  day: string;
  cost: string | number | null;
  cost_brl: string | number | null;
  tokens: string | number | null;
  calls: string | number | null;
}

interface ProviderRow {
  provider: string;
  cost: string | number | null;
  cost_brl: string | number | null;
  calls: string | number | null;
}

function toNumber(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function toIsoDay(v: unknown): string {
  if (v instanceof Date) {
    const yyyy = String(v.getUTCFullYear()).padStart(4, "0");
    const mm = String(v.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(v.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof v === "string") {
    // Postgres pode retornar como ISO timestamp ou yyyy-mm-dd.
    return v.slice(0, 10);
  }
  return "";
}

/**
 * Estatísticas agregadas de uso do LLM no período informado.
 *
 * - `byDay` agrega por dia local em America/Sao_Paulo (timezone padrão da
 *   plataforma). Aceita chamadas com 0 registros e retorna zeros.
 * - Todas as queries rodam em paralelo após `ensureLlmTables`.
 */
export async function getUsageStats(args: {
  start: Date;
  end: Date;
}): Promise<UsageSummary> {
  await ensureLlmTables();
  const { start, end } = args;

  const [summaryRes, modelRes, dayRes, providerRes] = await Promise.all([
    pgPool.query<SummaryRow>(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS total_cost,
         COALESCE(SUM(cost_brl), 0) AS total_cost_brl,
         COALESCE(SUM(tokens_input), 0) AS total_tokens_input,
         COALESCE(SUM(tokens_output), 0) AS total_tokens_output,
         COUNT(*) AS total_calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2`,
      [start, end],
    ),
    pgPool.query<ModelRow>(
      `SELECT
         provider,
         model,
         COALESCE(SUM(cost_usd), 0) AS cost,
         COALESCE(SUM(cost_brl), 0) AS cost_brl,
         COALESCE(SUM(tokens_input), 0) AS tokens_input,
         COALESCE(SUM(tokens_output), 0) AS tokens_output,
         COUNT(*) AS calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY provider, model
       ORDER BY cost DESC, calls DESC`,
      [start, end],
    ),
    pgPool.query<DayRow>(
      `SELECT
         (date_trunc('day', created_at AT TIME ZONE $3))::date AS day,
         COALESCE(SUM(cost_usd), 0) AS cost,
         COALESCE(SUM(cost_brl), 0) AS cost_brl,
         COALESCE(SUM(tokens_input + tokens_output), 0) AS tokens,
         COUNT(*) AS calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY day
       ORDER BY day ASC`,
      [start, end, TZ],
    ),
    pgPool.query<ProviderRow>(
      `SELECT
         provider,
         COALESCE(SUM(cost_usd), 0) AS cost,
         COALESCE(SUM(cost_brl), 0) AS cost_brl,
         COUNT(*) AS calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY provider
       ORDER BY cost DESC`,
      [start, end],
    ),
  ]);

  const summary = summaryRes.rows[0] ?? {
    total_cost: 0,
    total_cost_brl: 0,
    total_tokens_input: 0,
    total_tokens_output: 0,
    total_calls: 0,
  };

  return {
    totalCost: toNumber(summary.total_cost),
    totalCostBrl: toNumber(summary.total_cost_brl),
    totalTokensInput: toNumber(summary.total_tokens_input),
    totalTokensOutput: toNumber(summary.total_tokens_output),
    totalCalls: toNumber(summary.total_calls),
    byModel: modelRes.rows.map((r) => ({
      provider: r.provider,
      model: r.model,
      cost: toNumber(r.cost),
      costBrl: toNumber(r.cost_brl),
      tokensInput: toNumber(r.tokens_input),
      tokensOutput: toNumber(r.tokens_output),
      calls: toNumber(r.calls),
    })),
    byDay: dayRes.rows.map((r) => ({
      day: toIsoDay(r.day),
      cost: toNumber(r.cost),
      costBrl: toNumber(r.cost_brl),
      tokens: toNumber(r.tokens),
      calls: toNumber(r.calls),
    })),
    byProvider: providerRes.rows.map((r) => ({
      provider: r.provider,
      cost: toNumber(r.cost),
      costBrl: toNumber(r.cost_brl),
      calls: toNumber(r.calls),
    })),
  };
}

export interface UsageDetailRow {
  id: string;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  costBrl: number | null;
  usdToBrlRate: number | null;
  durationMs: number | null;
  /** ISO string em UTC. */
  createdAt: string;
}

export interface UsageDetailsResult {
  rows: UsageDetailRow[];
  total: number;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

/**
 * Lista paginada de chamadas individuais ao LLM no período.
 *
 * `limit` é clamped em [1, 200]; `offset` em [0, ∞). Retorna `total` para
 * permitir paginação UI.
 */
export async function getUsageDetails(args: {
  start: Date;
  end: Date;
  limit?: number;
  offset?: number;
}): Promise<UsageDetailsResult> {
  await ensureLlmTables();
  const { start, end } = args;
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(args.limit) ? Number(args.limit) : DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number.isFinite(args.offset) ? Number(args.offset) : 0);

  const [rowsRes, countRes] = await Promise.all([
    pgPool.query<{
      id: string;
      provider: string;
      model: string;
      tokens_input: number | string;
      tokens_output: number | string;
      cost_usd: number | string;
      cost_brl: number | string | null;
      usd_to_brl_rate: number | string | null;
      duration_ms: number | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, provider, model, tokens_input, tokens_output, cost_usd,
              cost_brl, usd_to_brl_rate, duration_ms, created_at
         FROM llm_usage
        WHERE created_at >= $1 AND created_at < $2
        ORDER BY created_at DESC
        LIMIT $3 OFFSET $4`,
      [start, end, limit, offset],
    ),
    pgPool.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM llm_usage
        WHERE created_at >= $1 AND created_at < $2`,
      [start, end],
    ),
  ]);

  const rows: UsageDetailRow[] = rowsRes.rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    tokensInput: toNumber(r.tokens_input),
    tokensOutput: toNumber(r.tokens_output),
    costUsd: toNumber(r.cost_usd),
    costBrl:
      r.cost_brl == null ? null : toNumber(r.cost_brl as string | number),
    usdToBrlRate:
      r.usd_to_brl_rate == null
        ? null
        : toNumber(r.usd_to_brl_rate as string | number),
    durationMs:
      r.duration_ms == null
        ? null
        : toNumber(r.duration_ms as string | number),
    createdAt:
      r.created_at instanceof Date
        ? r.created_at.toISOString()
        : new Date(r.created_at).toISOString(),
  }));

  return {
    rows,
    total: toNumber(countRes.rows[0]?.total ?? 0),
  };
}

/**
 * Data da primeira chamada registrada (usada como floor do filtro "Tudo").
 *
 * Retorna início do mês corrente (em UTC) quando não há registros, evitando
 * `null` em consumidores.
 */
export async function getSystemCreatedAt(): Promise<Date> {
  await ensureLlmTables();
  const result = await pgPool.query<{ min: Date | string | null }>(
    `SELECT MIN(created_at) AS min FROM llm_usage`,
  );
  const min = result.rows[0]?.min;
  if (!min) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }
  return min instanceof Date ? min : new Date(min);
}
