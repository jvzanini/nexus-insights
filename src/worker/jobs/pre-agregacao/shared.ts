/**
 * Utilitários compartilhados pelos jobs de pré-agregação (T3).
 *
 * Os 4 jobs de dimensão (`by_account`, `by_inbox`, `by_agent`, `by_team`) +
 * o job hourly compartilham:
 *   - descoberta de accounts ativas (via `user_account_access`)
 *   - lista de N datas rolling em TZ da plataforma
 *   - wrapper que atualiza `chatwoot_facts_meta` antes/depois do refresh
 *     (last_attempt_at, last_refresh_at, last_error, oldest/newest bucket).
 */

import { pgPool } from "@/lib/pg-pool";
import { getPlatformTz } from "@/lib/datetime";
import { publishRealtimeEvent } from "@/lib/realtime";

export type FactsDimension =
  | "by_account"
  | "by_inbox"
  | "by_agent"
  | "by_team"
  | "hourly_by_account";

const DIMENSION_TABLE: Record<FactsDimension, string> = {
  by_account: "chatwoot_facts_daily_by_account",
  by_inbox: "chatwoot_facts_daily_by_inbox",
  by_agent: "chatwoot_facts_daily_by_agent",
  by_team: "chatwoot_facts_daily_by_team",
  hourly_by_account: "chatwoot_facts_hourly_by_account",
};

/**
 * Retorna os Chatwoot account IDs distintos referenciados em `user_account_access`.
 * O schema atual NÃO tem coluna `revoked_at` — toda linha presente já representa
 * acesso ativo (revogação se faz por DELETE, não soft-delete). Cada job de
 * refresh percorre essa lista.
 */
export async function getAccountsToRefresh(): Promise<number[]> {
  const result = await pgPool.query<{ chatwoot_account_id: number }>(
    `SELECT DISTINCT chatwoot_account_id
     FROM user_account_access
     ORDER BY chatwoot_account_id ASC`,
  );
  return result.rows.map((r) => r.chatwoot_account_id);
}

/**
 * Retorna `n` datas (mais recente primeiro) em TZ da plataforma, no formato
 * ISO `YYYY-MM-DD`. Ex.: `rollingDates(7)` em 2026-04-30 SP →
 * `["2026-04-30", "2026-04-29", ..., "2026-04-24"]`.
 */
export async function rollingDates(n: number): Promise<string[]> {
  const tz = await getPlatformTz();
  const todayInTz = formatDateInTz(new Date(), tz);
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(addDaysToIso(todayInTz, -i));
  }
  return dates;
}

/**
 * Formata uma instância `Date` no fuso `tz`, devolvendo `YYYY-MM-DD`.
 *
 * Usa `Intl.DateTimeFormat("en-CA")` que produz `YYYY-MM-DD` nativamente.
 */
function formatDateInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

/**
 * Soma `delta` dias a um string ISO `YYYY-MM-DD` retornando outro string ISO.
 * Não usa TZ — opera sobre a representação calendária pura.
 */
function addDaysToIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map((s) => Number.parseInt(s, 10));
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + delta);
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Wrapper que envolve uma operação de refresh para `(dimension, accountId)`:
 *
 * - Antes: UPSERT em `chatwoot_facts_meta` com `last_attempt_at = NOW()`.
 * - Sucesso: SELECT MIN/MAX bucket_date para a dimensão + UPSERT meta com
 *   `last_refresh_at = NOW()`, `last_error = NULL`,
 *   `oldest_bucket_date`/`newest_bucket_date` populados.
 * - Erro: UPSERT meta com `last_error = err.message`. Re-lança o erro.
 */
export async function withMetaUpdate<T>(
  dimension: FactsDimension,
  accountId: number,
  fn: () => Promise<T>,
): Promise<T> {
  // Pre: registra tentativa
  await pgPool.query(
    `INSERT INTO chatwoot_facts_meta (
       dimension, account_id, last_attempt_at, created_at, updated_at
     ) VALUES ($1, $2, NOW(), NOW(), NOW())
     ON CONFLICT (dimension, account_id) DO UPDATE SET
       last_attempt_at = NOW(),
       updated_at = NOW()`,
    [dimension, accountId],
  );

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pgPool.query(
      `INSERT INTO chatwoot_facts_meta (
         dimension, account_id, last_error, created_at, updated_at
       ) VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (dimension, account_id) DO UPDATE SET
         last_error = $3,
         updated_at = NOW()`,
      [dimension, accountId, message],
    );
    throw err;
  }

  // Post-success: range de buckets atuais (informativo p/ UI de saúde).
  const table = DIMENSION_TABLE[dimension];
  const range = await pgPool.query<{
    oldest: string | null;
    newest: string | null;
  }>(
    `SELECT MIN(bucket_date) AS oldest, MAX(bucket_date) AS newest
     FROM ${table}
     WHERE account_id = $1`,
    [accountId],
  );
  const oldest = range.rows[0]?.oldest ?? null;
  const newest = range.rows[0]?.newest ?? null;

  await pgPool.query(
    `INSERT INTO chatwoot_facts_meta (
       dimension, account_id, last_refresh_at, last_error,
       oldest_bucket_date, newest_bucket_date,
       created_at, updated_at
     ) VALUES ($1, $2, NOW(), NULL, $3, $4, NOW(), NOW())
     ON CONFLICT (dimension, account_id) DO UPDATE SET
       last_refresh_at = NOW(),
       last_error = NULL,
       oldest_bucket_date = $3,
       newest_bucket_date = $4,
       updated_at = NOW()`,
    [dimension, accountId, oldest, newest],
  );

  // Pub/Sub: notifica clientes SSE (best-effort — falha não rola back).
  try {
    await publishRealtimeEvent({ type: "facts:refreshed", dimension, accountId });
  } catch (pubErr) {
    console.warn(
      "[withMetaUpdate] Falha ao publicar facts:refreshed (ignorado):",
      (pubErr as Error).message,
    );
  }

  return result;
}
