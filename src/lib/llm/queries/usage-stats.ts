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
  /** v0.31.0: 24 buckets (hour 0..23) quando range <= 24h. Undefined caso contrário. */
  byHour?: Array<{ hour: number; cost: number; costBrl: number; calls: number }>;
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
 * - `provider` é opcional; quando informado (string não vazia) filtra todas
 *   as 4 queries internas via predicado `($N::text IS NULL OR provider = $N)`.
 *   Quando `null`/`undefined`/`""`, mantém o comportamento original.
 */
export async function getUsageStats(args: {
  start: Date;
  end: Date;
  provider?: string | null;
}): Promise<UsageSummary> {
  await ensureLlmTables();
  const { start, end } = args;
  const provider =
    args.provider != null && args.provider !== "" ? args.provider : null;

  // v0.31.0: detecta range <= 24h pra ativar agregação hourly em paralelo.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const hourlyMode = end.getTime() - start.getTime() <= ONE_DAY_MS + 1;

  type HourRow = {
    hour: number | string;
    cost: string | number | null;
    cost_brl: string | number | null;
    calls: string | number | null;
  };
  const emptyHourRes: { rowCount: number; rows: HourRow[] } = {
    rowCount: 0,
    rows: [],
  };

  const [summaryRes, modelRes, dayRes, providerRes, hourRes] = await Promise.all([
    pgPool.query<SummaryRow>(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS total_cost,
         COALESCE(SUM(cost_brl), 0) AS total_cost_brl,
         COALESCE(SUM(tokens_input), 0) AS total_tokens_input,
         COALESCE(SUM(tokens_output), 0) AS total_tokens_output,
         COUNT(*) AS total_calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2
         AND ($3::text IS NULL OR provider = $3)`,
      [start, end, provider],
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
         AND ($3::text IS NULL OR provider = $3)
       GROUP BY provider, model
       ORDER BY cost DESC, calls DESC`,
      [start, end, provider],
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
         AND ($4::text IS NULL OR provider = $4)
       GROUP BY day
       ORDER BY day ASC`,
      [start, end, TZ, provider],
    ),
    pgPool.query<ProviderRow>(
      `SELECT
         provider,
         COALESCE(SUM(cost_usd), 0) AS cost,
         COALESCE(SUM(cost_brl), 0) AS cost_brl,
         COUNT(*) AS calls
       FROM llm_usage
       WHERE created_at >= $1 AND created_at < $2
         AND ($3::text IS NULL OR provider = $3)
       GROUP BY provider
       ORDER BY cost DESC`,
      [start, end, provider],
    ),
    hourlyMode
      ? pgPool.query<HourRow>(
          `SELECT EXTRACT(HOUR FROM (created_at AT TIME ZONE $3))::int AS hour,
                  COALESCE(SUM(cost_usd), 0) AS cost,
                  COALESCE(SUM(cost_brl), 0) AS cost_brl,
                  COUNT(*) AS calls
             FROM llm_usage
            WHERE created_at >= $1 AND created_at < $2
              AND ($4::text IS NULL OR provider = $4)
            GROUP BY hour
            ORDER BY hour ASC`,
          [start, end, TZ, provider],
        )
      : Promise.resolve(emptyHourRes),
  ]);

  let byHour: UsageSummary["byHour"];
  if (hourlyMode) {
    // Inicializa 24 buckets zerados (00:00..23:00); buckets vazios mantêm 0.
    byHour = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      cost: 0,
      costBrl: 0,
      calls: 0,
    }));
    for (const r of hourRes.rows) {
      const h = Number(r.hour);
      if (Number.isFinite(h) && h >= 0 && h <= 23) {
        byHour[h] = {
          hour: h,
          cost: toNumber(r.cost),
          costBrl: toNumber(r.cost_brl),
          calls: toNumber(r.calls),
        };
      }
    }
  }

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
    byHour,
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
  /** Caracteres do prompt (entrada). `null` quando não persistido. */
  promptChars: number | null;
  /** Caracteres da resposta. `null` quando não persistido. */
  responseChars: number | null;
  /** UUID do usuário que disparou a chamada. `null` em chamadas anônimas. */
  userId: string | null;
  /** Mensagem de erro quando a chamada falhou. `null` em chamadas com sucesso. */
  errorMessage: string | null;
  /** v0.31.0: true = chamada do Playground; false = Bubble (Agente Nex). */
  isPlayground: boolean;
}

export interface UsageDetailsTotals {
  costUsd: number;
  costBrl: number;
  tokensInput: number;
  tokensOutput: number;
  durationMsTotal: number;
  count: number;
}

export interface UsageDetailsResult {
  rows: UsageDetailRow[];
  total: number;
  totals: UsageDetailsTotals;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

/**
 * Lista paginada de chamadas individuais ao LLM no período, com filtros
 * opcionais de provider/model e totals server-side calculados sobre o
 * universo filtrado (não apenas a página corrente).
 *
 * - `limit` clamped em [1, 200]; `offset` em [0, ∞).
 * - `provider`/`model` aceitam string exata ou são ignorados quando `null`/
 *   `undefined`. Os filtros são aplicados via predicado `($n::text IS NULL
 *   OR coluna = $n)` para permitir o mesmo SQL com/sem filtro.
 * - `totals` reflete TODAS as linhas do período + filtros (não a página).
 */
export async function getUsageDetails(args: {
  start: Date;
  end: Date;
  limit?: number;
  offset?: number;
  provider?: string | null;
  model?: string | null;
  /** v0.31.0: true = só Playground; false = só Bubble; null/undefined = ambos. */
  isPlayground?: boolean | null;
}): Promise<UsageDetailsResult> {
  await ensureLlmTables();
  const { start, end } = args;
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, Number.isFinite(args.limit) ? Number(args.limit) : DEFAULT_LIMIT),
  );
  const offset = Math.max(0, Number.isFinite(args.offset) ? Number(args.offset) : 0);
  const provider =
    args.provider != null && args.provider !== "" ? args.provider : null;
  const model = args.model != null && args.model !== "" ? args.model : null;
  const isPlayground =
    typeof args.isPlayground === "boolean" ? args.isPlayground : null;

  // Predicado comum: range temporal + filtros opcionais via IS NULL OR =.
  const whereClause = `created_at >= $1 AND created_at < $2
    AND ($3::text IS NULL OR provider = $3)
    AND ($4::text IS NULL OR model = $4)
    AND ($5::boolean IS NULL OR is_playground = $5)`;

  const [rowsRes, countRes, totalsRes] = await Promise.all([
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
      prompt_chars: number | string | null;
      response_chars: number | string | null;
      user_id: string | null;
      error_message: string | null;
      is_playground: boolean | null;
    }>(
      `SELECT id, provider, model, tokens_input, tokens_output, cost_usd,
              cost_brl, usd_to_brl_rate, duration_ms, created_at,
              prompt_chars, response_chars, user_id, error_message,
              is_playground
         FROM llm_usage
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $6 OFFSET $7`,
      [start, end, provider, model, isPlayground, limit, offset],
    ),
    pgPool.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM llm_usage
        WHERE ${whereClause}`,
      [start, end, provider, model, isPlayground],
    ),
    pgPool.query<{
      sum_cost_usd: string | number | null;
      sum_cost_brl: string | number | null;
      sum_tokens_input: string | number | null;
      sum_tokens_output: string | number | null;
      sum_duration_ms: string | number | null;
    }>(
      `SELECT
         COALESCE(SUM(cost_usd), 0) AS sum_cost_usd,
         COALESCE(SUM(cost_brl), 0) AS sum_cost_brl,
         COALESCE(SUM(tokens_input), 0) AS sum_tokens_input,
         COALESCE(SUM(tokens_output), 0) AS sum_tokens_output,
         COALESCE(SUM(duration_ms), 0) AS sum_duration_ms
       FROM llm_usage
       WHERE ${whereClause}`,
      [start, end, provider, model, isPlayground],
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
    promptChars:
      r.prompt_chars == null
        ? null
        : toNumber(r.prompt_chars as string | number),
    responseChars:
      r.response_chars == null
        ? null
        : toNumber(r.response_chars as string | number),
    userId: r.user_id ?? null,
    errorMessage: r.error_message ?? null,
    isPlayground: !!r.is_playground,
  }));

  const total = toNumber(countRes.rows[0]?.total ?? 0);
  const totalsRow = totalsRes.rows[0];
  const totals: UsageDetailsTotals = {
    costUsd: toNumber(totalsRow?.sum_cost_usd ?? 0),
    costBrl: toNumber(totalsRow?.sum_cost_brl ?? 0),
    tokensInput: toNumber(totalsRow?.sum_tokens_input ?? 0),
    tokensOutput: toNumber(totalsRow?.sum_tokens_output ?? 0),
    durationMsTotal: toNumber(totalsRow?.sum_duration_ms ?? 0),
    count: total,
  };

  return { rows, total, totals };
}

/**
 * Lista de providers distintos com chamadas no período. Ordenada
 * alfabeticamente para consumo direto em <select>.
 */
export async function getDistinctProvidersInRange(args: {
  start: Date;
  end: Date;
}): Promise<string[]> {
  await ensureLlmTables();
  const { start, end } = args;
  const res = await pgPool.query<{ provider: string }>(
    `SELECT DISTINCT provider
       FROM llm_usage
      WHERE created_at >= $1 AND created_at < $2
      ORDER BY provider ASC`,
    [start, end],
  );
  return res.rows.map((r) => r.provider).filter((p) => !!p).sort();
}

/**
 * Lista de modelos distintos com chamadas no período. Quando `provider` é
 * informado, filtra apenas modelos daquele provider (cascade UI).
 */
export async function getDistinctModelsInRange(args: {
  start: Date;
  end: Date;
  provider?: string | null;
}): Promise<string[]> {
  await ensureLlmTables();
  const { start, end } = args;
  const provider =
    args.provider != null && args.provider !== "" ? args.provider : null;
  const res = await pgPool.query<{ model: string }>(
    `SELECT DISTINCT model
       FROM llm_usage
      WHERE created_at >= $1 AND created_at < $2
        AND ($3::text IS NULL OR provider = $3)
      ORDER BY model ASC`,
    [start, end, provider],
  );
  return res.rows.map((r) => r.model).filter((m) => !!m).sort();
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
