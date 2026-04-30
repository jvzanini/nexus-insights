/**
 * Job: refresh-by-account (T3).
 *
 * Para cada Chatwoot account ativa (descoberta via `user_account_access`),
 * agrega os últimos 7 dias rolling (TZ da plataforma) em:
 *   - chatwoot_facts_daily_by_account (1 linha por dia)
 *   - chatwoot_facts_hourly_by_account (24 linhas por dia)
 *
 * Concorrência:
 *   - Accounts processadas SEQUENCIALMENTE (uma por vez). O pool do Chatwoot
 *     já serializa queries globalmente, então paralelizar accounts não
 *     traz benefício e aumenta risco de timeout.
 *   - Falha em uma account NÃO interrompe as outras: cada account é tentada
 *     dentro de um try/catch independente. O erro é persistido em
 *     `chatwoot_facts_meta.last_error` (via `withMetaUpdate`).
 *
 * Idempotência:
 *   - Todos os UPSERTs usam `ON CONFLICT ... DO UPDATE`, então rodar o job
 *     N vezes seguidas converge para o mesmo estado.
 *
 * Snapshot de estado (open/pending) é capturado APENAS para o dia atual.
 * Para dias passados, gravamos 0 — o snapshot real do "fim do dia X" não é
 * recuperável retroativamente do estado atual do Chatwoot.
 */

import type { Job } from "bullmq";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import { pgPool } from "@/lib/pg-pool";
import {
  getAccountsToRefresh,
  rollingDates,
  withMetaUpdate,
} from "./shared";

interface DailyMetricsRow {
  received: number;
  resolved: number;
  unique_contacts: number;
  messages_in: number;
  messages_out: number;
  frt_p50_seconds: number | null;
  frt_p90_seconds: number | null;
  rt_p50_seconds: number | null;
}

interface SnapshotRow {
  open_at_eod: number;
  pending_at_eod: number;
}

interface HourlyConvRow {
  bucket_hour: number;
  received: number;
  resolved: number;
  unique_contacts: number;
}

interface HourlyMsgRow {
  bucket_hour: number;
  messages_in: number;
  messages_out: number;
}

const DAILY_METRICS_SQL = `
WITH day_window AS (
  SELECT
    ($1::date AT TIME ZONE 'America/Sao_Paulo')                     AS day_start,
    (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo') AS day_end
),
conv_metrics AS (
  SELECT
    COUNT(*)                                                    AS received,
    COUNT(*) FILTER (
      WHERE c.status = 1
        AND c.last_activity_at >= dw.day_start
        AND c.last_activity_at < dw.day_end
    )                                                           AS resolved,
    COUNT(DISTINCT c.contact_id)                                AS unique_contacts
  FROM day_window dw, conversations c
  WHERE c.account_id = $2
    AND c.created_at >= dw.day_start
    AND c.created_at < dw.day_end
),
msg_metrics AS (
  SELECT
    COUNT(*) FILTER (WHERE m.message_type = 0) AS messages_in,
    COUNT(*) FILTER (WHERE m.message_type = 1) AS messages_out
  FROM day_window dw, messages m
  WHERE m.account_id = $2
    AND m.created_at >= dw.day_start
    AND m.created_at < dw.day_end
),
re_metrics AS (
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::int AS frt_p50,
    percentile_cont(0.9) WITHIN GROUP (ORDER BY value)::int AS frt_p90
  FROM day_window dw, reporting_events re
  WHERE re.account_id = $2
    AND re.name = 'first_response'
    AND re.value IS NOT NULL
    AND re.created_at >= dw.day_start
    AND re.created_at < dw.day_end
),
re_resolution AS (
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY value)::int AS rt_p50
  FROM day_window dw, reporting_events re
  WHERE re.account_id = $2
    AND re.name = 'conversation_resolved'
    AND re.value IS NOT NULL
    AND re.created_at >= dw.day_start
    AND re.created_at < dw.day_end
)
SELECT
  COALESCE(cv.received, 0)         AS received,
  COALESCE(cv.resolved, 0)         AS resolved,
  COALESCE(cv.unique_contacts, 0)  AS unique_contacts,
  COALESCE(mm.messages_in, 0)      AS messages_in,
  COALESCE(mm.messages_out, 0)     AS messages_out,
  re.frt_p50                       AS frt_p50_seconds,
  re.frt_p90                       AS frt_p90_seconds,
  rr.rt_p50                        AS rt_p50_seconds
FROM conv_metrics cv, msg_metrics mm, re_metrics re, re_resolution rr;
`;

const SNAPSHOT_SQL = `
SELECT
  COUNT(*) FILTER (WHERE c.status = 0) AS open_at_eod,
  COUNT(*) FILTER (WHERE c.status = 2) AS pending_at_eod
FROM conversations c
WHERE c.account_id = $1
`;

const HOURLY_CONV_SQL = `
WITH hours AS (
  SELECT generate_series(0, 23) AS h
)
SELECT
  h.h                                                                   AS bucket_hour,
  COUNT(*) FILTER (
    WHERE c.created_at >= ($1::date + (h.h * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
      AND c.created_at <  ($1::date + ((h.h + 1) * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
  )                                                                     AS received,
  COUNT(*) FILTER (
    WHERE c.status = 1
      AND c.last_activity_at >= ($1::date + (h.h * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
      AND c.last_activity_at <  ($1::date + ((h.h + 1) * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
  )                                                                     AS resolved,
  COUNT(DISTINCT c.contact_id) FILTER (
    WHERE c.created_at >= ($1::date + (h.h * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
      AND c.created_at <  ($1::date + ((h.h + 1) * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
  )                                                                     AS unique_contacts
FROM hours h
LEFT JOIN conversations c ON c.account_id = $2
GROUP BY h.h
ORDER BY h.h ASC;
`;

const HOURLY_MSG_SQL = `
WITH hours AS (
  SELECT generate_series(0, 23) AS h
)
SELECT
  h.h AS bucket_hour,
  COUNT(*) FILTER (
    WHERE m.message_type = 0
      AND m.created_at >= ($1::date + (h.h * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
      AND m.created_at <  ($1::date + ((h.h + 1) * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
  ) AS messages_in,
  COUNT(*) FILTER (
    WHERE m.message_type = 1
      AND m.created_at >= ($1::date + (h.h * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
      AND m.created_at <  ($1::date + ((h.h + 1) * INTERVAL '1 hour')) AT TIME ZONE 'America/Sao_Paulo'
  ) AS messages_out
FROM hours h
LEFT JOIN messages m ON m.account_id = $2
GROUP BY h.h
ORDER BY h.h ASC;
`;

const DAILY_UPSERT_SQL = `
INSERT INTO chatwoot_facts_daily_by_account (
  account_id, bucket_date,
  received, resolved, open_at_eod, pending_at_eod,
  messages_in, messages_out, unique_contacts,
  frt_p50_seconds, frt_p90_seconds, rt_p50_seconds,
  created_at, updated_at
) VALUES (
  $1, $2,
  $3, $4, $5, $6,
  $7, $8, $9,
  $10, $11, $12,
  NOW(), NOW()
)
ON CONFLICT (account_id, bucket_date) DO UPDATE SET
  received = EXCLUDED.received,
  resolved = EXCLUDED.resolved,
  open_at_eod = EXCLUDED.open_at_eod,
  pending_at_eod = EXCLUDED.pending_at_eod,
  messages_in = EXCLUDED.messages_in,
  messages_out = EXCLUDED.messages_out,
  unique_contacts = EXCLUDED.unique_contacts,
  frt_p50_seconds = EXCLUDED.frt_p50_seconds,
  frt_p90_seconds = EXCLUDED.frt_p90_seconds,
  rt_p50_seconds = EXCLUDED.rt_p50_seconds,
  updated_at = NOW();
`;

const HOURLY_UPSERT_SQL = `
INSERT INTO chatwoot_facts_hourly_by_account (
  account_id, bucket_date, bucket_hour,
  received, resolved, messages_in, messages_out, unique_contacts,
  created_at, updated_at
) VALUES (
  $1, $2, $3,
  $4, $5, $6, $7, $8,
  NOW(), NOW()
)
ON CONFLICT (account_id, bucket_date, bucket_hour) DO UPDATE SET
  received = EXCLUDED.received,
  resolved = EXCLUDED.resolved,
  messages_in = EXCLUDED.messages_in,
  messages_out = EXCLUDED.messages_out,
  unique_contacts = EXCLUDED.unique_contacts,
  updated_at = NOW();
`;

/**
 * Processa um único par (account, date): roda 4 SQL no Chatwoot e faz 25
 * UPSERTs no banco interno (1 daily + 24 hourly).
 */
async function refreshAccountDay(
  accountId: number,
  date: string,
  isToday: boolean,
): Promise<void> {
  // 1) Daily metrics agregadas (1 query no Chatwoot).
  const dailyRows = await chatwootQuery<DailyMetricsRow>(DAILY_METRICS_SQL, [
    date,
    accountId,
  ]);
  const daily: DailyMetricsRow = dailyRows[0] ?? {
    received: 0,
    resolved: 0,
    unique_contacts: 0,
    messages_in: 0,
    messages_out: 0,
    frt_p50_seconds: null,
    frt_p90_seconds: null,
    rt_p50_seconds: null,
  };

  // 2) Snapshot APENAS p/ hoje (estado de fim-de-dia para passados é 0).
  let openAtEod = 0;
  let pendingAtEod = 0;
  if (isToday) {
    const snapshotRows = await chatwootQuery<SnapshotRow>(SNAPSHOT_SQL, [
      accountId,
    ]);
    const snap = snapshotRows[0];
    if (snap) {
      openAtEod = Number(snap.open_at_eod) || 0;
      pendingAtEod = Number(snap.pending_at_eod) || 0;
    }
  }

  // 3) UPSERT do daily no banco interno.
  await pgPool.query(DAILY_UPSERT_SQL, [
    accountId,
    date,
    Number(daily.received) || 0,
    Number(daily.resolved) || 0,
    openAtEod,
    pendingAtEod,
    Number(daily.messages_in) || 0,
    Number(daily.messages_out) || 0,
    Number(daily.unique_contacts) || 0,
    daily.frt_p50_seconds,
    daily.frt_p90_seconds,
    daily.rt_p50_seconds,
  ]);

  // 4) Hourly: 2 queries no Chatwoot (conv + msg) — pool serializa.
  const [convHourly, msgHourly] = await Promise.all([
    chatwootQuery<HourlyConvRow>(HOURLY_CONV_SQL, [date, accountId]),
    chatwootQuery<HourlyMsgRow>(HOURLY_MSG_SQL, [date, accountId]),
  ]);

  const msgByHour = new Map<number, HourlyMsgRow>();
  for (const r of msgHourly) {
    msgByHour.set(Number(r.bucket_hour), r);
  }

  // 5) UPSERTs hourly: 24 inserts. Sequencial pra não estourar pool interno.
  for (const conv of convHourly) {
    const hour = Number(conv.bucket_hour);
    const msg = msgByHour.get(hour);
    await pgPool.query(HOURLY_UPSERT_SQL, [
      accountId,
      date,
      hour,
      Number(conv.received) || 0,
      Number(conv.resolved) || 0,
      msg ? Number(msg.messages_in) || 0 : 0,
      msg ? Number(msg.messages_out) || 0 : 0,
      Number(conv.unique_contacts) || 0,
    ]);
  }
}

/**
 * Entrypoint do job. Chamado pelo Worker BullMQ a cada 5 minutos.
 */
export async function processRefreshByAccount(
  job: Job,
): Promise<{ accounts: number; days: number; errors: number }> {
  const accounts = await getAccountsToRefresh();
  const dates = await rollingDates(7);
  const today = dates[0];

  let errors = 0;

  for (const accountId of accounts) {
    try {
      await withMetaUpdate("by_account", accountId, async () => {
        for (const date of dates) {
          await refreshAccountDay(accountId, date, date === today);
        }
      });

      await withMetaUpdate("hourly_by_account", accountId, async () => {
        // O work do hourly já aconteceu em refreshAccountDay (cobre as 2
        // dimensões na mesma passada). Aqui só reflete o sucesso no meta.
      });
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      try {
        await job.log(
          `[refresh-by-account] account ${accountId} falhou: ${message}`,
        );
      } catch {
        // job.log pode não existir em todos os contextos (ex.: tests).
      }
      // eslint-disable-next-line no-console
      console.error(
        `[refresh-by-account] account=${accountId} error:`,
        message,
      );
    }
  }

  return {
    accounts: accounts.length,
    days: accounts.length * dates.length,
    errors,
  };
}
