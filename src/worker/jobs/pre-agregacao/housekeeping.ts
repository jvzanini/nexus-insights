/**
 * Job: housekeeping-old-buckets (T6).
 *
 * Lê `audit.retention_days` da tabela `app_settings` (default 90).
 * DELETEa de todas as 5 tabelas de facts:
 *   WHERE bucket_date < CURRENT_DATE - retention_days
 *
 * Executado em cadência baixa (diário) — ver T7 para o agendamento.
 *
 * Reusa a queue existente `housekeepingQueue` (sem queue nova).
 */

import { pgPool } from "@/lib/pg-pool";

const FACTS_TABLES = [
  "chatwoot_facts_daily_by_account",
  "chatwoot_facts_daily_by_inbox",
  "chatwoot_facts_daily_by_agent",
  "chatwoot_facts_daily_by_team",
  "chatwoot_facts_hourly_by_account",
] as const;

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Lê `audit.retention_days` de app_settings. Retorna 90 se ausente ou inválido.
 */
async function readRetentionDays(): Promise<number> {
  const result = await pgPool.query<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
    ["audit.retention_days"],
  );
  if (!result.rowCount || !result.rows[0]) {
    return DEFAULT_RETENTION_DAYS;
  }
  const raw = result.rows[0].value;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  return parsed;
}

export async function processHousekeeping(): Promise<{
  deletedByTable: Record<string, number>;
}> {
  const retention = await readRetentionDays();
  const deletedByTable: Record<string, number> = {};

  for (const table of FACTS_TABLES) {
    const result = await pgPool.query(
      `DELETE FROM ${table} WHERE bucket_date < CURRENT_DATE - $1::int`,
      [retention],
    );
    const rowCount = typeof result.rowCount === "number" ? result.rowCount : 0;
    deletedByTable[table] = rowCount;
    // eslint-disable-next-line no-console
    console.log(`[housekeeping] deleted ${rowCount} rows from ${table}`);
  }

  return { deletedByTable };
}
