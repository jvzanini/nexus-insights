/**
 * Job: refresh-by-team (T6).
 *
 * Para cada Chatwoot account ativa, agrega os últimos 7 dias rolling em:
 *   - chatwoot_facts_daily_by_team (1 linha por (account, date, team))
 *
 * SENTINEL — team_id NULL: a tabela tem `team_id INT NOT NULL DEFAULT 0`.
 * Conversas sem time atribuído viram `team_id = 0` via `COALESCE(c.team_id, 0)`
 * em todos os SQL agregados. Isso permite que o dashboard mostre
 * "sem time" como uma linha distinta sem precisar de NULL semantic.
 *
 * Concorrência / idempotência / snapshot: ver `refresh-by-account.ts`.
 */

import type { Job } from "bullmq";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import { pgPool } from "@/lib/pg-pool";
import {
  getAccountsToRefresh,
  rollingDates,
  withMetaUpdate,
} from "./shared";

interface DailyConvRow {
  team_id: number;
  received: number;
  resolved: number;
  unique_contacts: number;
}

interface DailyMsgRow {
  team_id: number;
  messages_in: number;
  messages_out: number;
}

interface FrtRow {
  team_id: number;
  frt_p50: number | null;
  frt_p90: number | null;
}

interface RtRow {
  team_id: number;
  rt_p50: number | null;
}

interface SnapshotRow {
  team_id: number;
  open_at_eod: number;
  pending_at_eod: number;
}

const DAILY_CONV_SQL = `
WITH day_window AS (
  SELECT
    ($1::date AT TIME ZONE 'America/Sao_Paulo')                     AS day_start,
    (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo') AS day_end
)
SELECT
  COALESCE(c.team_id, 0) AS team_id,
  COUNT(*) AS received,
  COUNT(*) FILTER (
    WHERE c.status = 1
      AND c.last_activity_at >= dw.day_start
      AND c.last_activity_at < dw.day_end
  ) AS resolved,
  COUNT(DISTINCT c.contact_id) AS unique_contacts
FROM day_window dw
JOIN conversations c ON c.account_id = $2
                     AND c.created_at >= dw.day_start
                     AND c.created_at < dw.day_end
GROUP BY COALESCE(c.team_id, 0)
`;

const DAILY_MSG_SQL = `
SELECT
  COALESCE(c.team_id, 0) AS team_id,
  COUNT(*) FILTER (WHERE m.message_type = 0) AS messages_in,
  COUNT(*) FILTER (WHERE m.message_type = 1) AS messages_out
FROM messages m
JOIN conversations c ON c.id = m.conversation_id
WHERE m.account_id = $2
  AND m.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
  AND m.created_at <  (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
GROUP BY COALESCE(c.team_id, 0)
`;

const FRT_SQL = `
SELECT
  COALESCE(c.team_id, 0) AS team_id,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::int AS frt_p50,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY re.value)::int AS frt_p90
FROM reporting_events re
JOIN conversations c ON c.id = re.conversation_id
WHERE re.account_id = $2
  AND re.name = 'first_response'
  AND re.value IS NOT NULL
  AND re.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
  AND re.created_at <  (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
GROUP BY COALESCE(c.team_id, 0)
`;

const RT_SQL = `
SELECT
  COALESCE(c.team_id, 0) AS team_id,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY re.value)::int AS rt_p50
FROM reporting_events re
JOIN conversations c ON c.id = re.conversation_id
WHERE re.account_id = $2
  AND re.name = 'conversation_resolved'
  AND re.value IS NOT NULL
  AND re.created_at >= ($1::date AT TIME ZONE 'America/Sao_Paulo')
  AND re.created_at <  (($1::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')
GROUP BY COALESCE(c.team_id, 0)
`;

const SNAPSHOT_SQL = `
SELECT
  COALESCE(c.team_id, 0) AS team_id,
  COUNT(*) FILTER (WHERE c.status = 0) AS open_at_eod,
  COUNT(*) FILTER (WHERE c.status = 2) AS pending_at_eod
FROM conversations c
WHERE c.account_id = $1
GROUP BY COALESCE(c.team_id, 0)
`;

const UPSERT_SQL = `
INSERT INTO chatwoot_facts_daily_by_team (
  account_id, bucket_date, team_id,
  received, resolved, open_at_eod, pending_at_eod,
  messages_in, messages_out, unique_contacts,
  frt_p50_seconds, frt_p90_seconds, rt_p50_seconds,
  created_at, updated_at
) VALUES (
  $1, $2, $3,
  $4, $5, $6, $7,
  $8, $9, $10,
  $11, $12, $13,
  NOW(), NOW()
)
ON CONFLICT (account_id, bucket_date, team_id) DO UPDATE SET
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

interface AggregatedTeam {
  team_id: number;
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

async function refreshAccountDay(
  accountId: number,
  date: string,
  isToday: boolean,
): Promise<void> {
  const [convRows, msgRows, frtRows, rtRows] = await Promise.all([
    chatwootQuery<DailyConvRow>(DAILY_CONV_SQL, [date, accountId]),
    chatwootQuery<DailyMsgRow>(DAILY_MSG_SQL, [date, accountId]),
    chatwootQuery<FrtRow>(FRT_SQL, [date, accountId]),
    chatwootQuery<RtRow>(RT_SQL, [date, accountId]),
  ]);

  const snapshotRows: SnapshotRow[] = isToday
    ? await chatwootQuery<SnapshotRow>(SNAPSHOT_SQL, [accountId])
    : [];

  const acc = new Map<number, AggregatedTeam>();

  function ensure(teamId: number): AggregatedTeam {
    let entry = acc.get(teamId);
    if (!entry) {
      entry = {
        team_id: teamId,
        received: 0,
        resolved: 0,
        open_at_eod: 0,
        pending_at_eod: 0,
        messages_in: 0,
        messages_out: 0,
        unique_contacts: 0,
        frt_p50_seconds: null,
        frt_p90_seconds: null,
        rt_p50_seconds: null,
      };
      acc.set(teamId, entry);
    }
    return entry;
  }

  for (const r of convRows) {
    const e = ensure(Number(r.team_id));
    e.received = Number(r.received) || 0;
    e.resolved = Number(r.resolved) || 0;
    e.unique_contacts = Number(r.unique_contacts) || 0;
  }
  for (const r of msgRows) {
    const e = ensure(Number(r.team_id));
    e.messages_in = Number(r.messages_in) || 0;
    e.messages_out = Number(r.messages_out) || 0;
  }
  for (const r of frtRows) {
    const e = ensure(Number(r.team_id));
    e.frt_p50_seconds = r.frt_p50 == null ? null : Number(r.frt_p50);
    e.frt_p90_seconds = r.frt_p90 == null ? null : Number(r.frt_p90);
  }
  for (const r of rtRows) {
    const e = ensure(Number(r.team_id));
    e.rt_p50_seconds = r.rt_p50 == null ? null : Number(r.rt_p50);
  }
  for (const r of snapshotRows) {
    const e = ensure(Number(r.team_id));
    e.open_at_eod = Number(r.open_at_eod) || 0;
    e.pending_at_eod = Number(r.pending_at_eod) || 0;
  }

  for (const entry of acc.values()) {
    await pgPool.query(UPSERT_SQL, [
      accountId,
      date,
      entry.team_id,
      entry.received,
      entry.resolved,
      entry.open_at_eod,
      entry.pending_at_eod,
      entry.messages_in,
      entry.messages_out,
      entry.unique_contacts,
      entry.frt_p50_seconds,
      entry.frt_p90_seconds,
      entry.rt_p50_seconds,
    ]);
  }
}

export async function processRefreshByTeam(
  job: Job,
): Promise<{ accounts: number; days: number; errors: number }> {
  const accounts = await getAccountsToRefresh();
  const dates = await rollingDates(7);
  const today = dates[0];

  let errors = 0;

  for (const accountId of accounts) {
    try {
      await withMetaUpdate("by_team", accountId, async () => {
        for (const date of dates) {
          await refreshAccountDay(accountId, date, date === today);
        }
      });
    } catch (err) {
      errors += 1;
      const message = err instanceof Error ? err.message : String(err);
      try {
        await job.log(
          `[refresh-by-team] account ${accountId} falhou: ${message}`,
        );
      } catch {
        // job.log pode não existir em todos os contextos (ex.: tests).
      }
      // eslint-disable-next-line no-console
      console.error(
        `[refresh-by-team] account=${accountId} error:`,
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
