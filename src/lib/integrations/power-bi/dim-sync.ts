/**
 * Sincroniza snapshots de dimensões (accounts, inboxes, agents, teams)
 * do banco Chatwoot pro schema `powerbi.*` no banco interno (Nexus Insights).
 *
 * Cada dim tem try/catch isolado: falha em uma não bloqueia outras.
 * Estratégia UPSERT (não TRUNCATE) pra evitar janela de tabela vazia
 * pra Power BI conectado em DirectQuery.
 *
 * Schema Chatwoot real (descoberto via grep em src/lib/chatwoot/queries):
 * - `inboxes` (id, account_id, name)  → channel_type pode não existir; SELECT defensivo
 * - `teams` (id, account_id, name)
 * - `users` (id, name, email) JOIN `account_users` (account_id, user_id) — não há tabela `agents` separada
 * - `accounts` (id, name) — coluna `status` pode não estar disponível em todas as instalações
 *
 * Cron 30 min via BullMQ scheduler.
 */

import format from "pg-format";
import { chatwootQuery } from "@/lib/chatwoot/pool";
import { pgPool } from "@/lib/pg-pool";

export interface SnapshotResult {
  dim: string;
  upserted: number;
  errors: string[];
}

async function upsertDim(
  table: string,
  pkColumns: string[],
  rows: Array<Record<string, unknown>>,
  cols: string[],
): Promise<void> {
  if (rows.length === 0) return;
  const tuples = rows.map((r) => {
    const values = cols.map((c) => r[c]);
    return format(
      `(${values.map(() => "%L").join(", ")}, now())`,
      ...values,
    );
  });
  const colsList = cols.map((c) => format("%I", c)).join(", ");
  const updateSet = cols
    .filter((c) => !pkColumns.includes(c))
    .map((c) => format("%I = EXCLUDED.%I", c, c))
    .concat([format("%I = EXCLUDED.%I", "refreshed_at", "refreshed_at")])
    .join(", ");
  const conflictTarget = pkColumns.map((c) => format("%I", c)).join(", ");
  const sql = format(
    `INSERT INTO powerbi.%I (${colsList}, refreshed_at)
     VALUES %s
     ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`,
    table,
    tuples.join(", "),
  );

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      format(
        "DELETE FROM powerbi.%I WHERE refreshed_at < now() - INTERVAL '1 hour'",
        table,
      ),
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function refreshAccountsDim(): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    dim: "dim_accounts",
    upserted: 0,
    errors: [],
  };
  try {
    const rows = await chatwootQuery<{
      id: number;
      name: string;
      status: string | null;
    }>("SELECT id, name, status FROM accounts");
    const data = rows.map((r) => ({
      account_id: r.id,
      name: r.name,
      status: r.status,
    }));
    await upsertDim(
      "dim_accounts_snapshot",
      ["account_id"],
      data,
      ["account_id", "name", "status"],
    );
    result.upserted = data.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
  }
  return result;
}

export async function refreshInboxesDim(): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    dim: "dim_inboxes",
    upserted: 0,
    errors: [],
  };
  try {
    const rows = await chatwootQuery<{
      account_id: number;
      id: number;
      name: string;
      channel_type: string | null;
    }>("SELECT account_id, id, name, channel_type FROM inboxes");
    const data = rows.map((r) => ({
      account_id: r.account_id,
      inbox_id: r.id,
      name: r.name,
      channel_type: r.channel_type,
    }));
    await upsertDim(
      "dim_inboxes_snapshot",
      ["account_id", "inbox_id"],
      data,
      ["account_id", "inbox_id", "name", "channel_type"],
    );
    result.upserted = data.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
  }
  return result;
}

export async function refreshAgentsDim(): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    dim: "dim_agents",
    upserted: 0,
    errors: [],
  };
  try {
    // Chatwoot não tem tabela `agents` — agentes são `users` ligados a accounts
    // via `account_users`. Padrão usado em src/lib/chatwoot/queries/meta-cache.ts (getUsers).
    const rows = await chatwootQuery<{
      account_id: number;
      user_id: number;
      name: string;
      email: string | null;
    }>(
      `SELECT au.account_id, u.id AS user_id, u.name, u.email
       FROM users u
       JOIN account_users au ON au.user_id = u.id`,
    );
    const data = rows.map((r) => ({
      account_id: r.account_id,
      agent_id: r.user_id,
      name: r.name,
      email: r.email,
    }));
    await upsertDim(
      "dim_agents_snapshot",
      ["account_id", "agent_id"],
      data,
      ["account_id", "agent_id", "name", "email"],
    );
    result.upserted = data.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
  }
  return result;
}

export async function refreshTeamsDim(): Promise<SnapshotResult> {
  const result: SnapshotResult = {
    dim: "dim_teams",
    upserted: 0,
    errors: [],
  };
  try {
    const rows = await chatwootQuery<{
      account_id: number;
      id: number;
      name: string;
    }>("SELECT account_id, id, name FROM teams");
    const data = rows.map((r) => ({
      account_id: r.account_id,
      team_id: r.id,
      name: r.name,
    }));
    await upsertDim(
      "dim_teams_snapshot",
      ["account_id", "team_id"],
      data,
      ["account_id", "team_id", "name"],
    );
    result.upserted = data.length;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(msg);
  }
  return result;
}

export async function refreshAllDimSnapshots(): Promise<SnapshotResult[]> {
  return Promise.all([
    refreshAccountsDim(),
    refreshInboxesDim(),
    refreshAgentsDim(),
    refreshTeamsDim(),
  ]);
}
