import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `account_users` do Chatwoot.
 *
 * Cursor: `updated_at`. Tabela tem `account_id` direto.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "account_users");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT id, account_id, user_id, role, inviter_id, created_at, updated_at
    FROM account_users
    WHERE account_id = $1
      AND updated_at > $2
    ORDER BY updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    user_id: number;
    role: number;
    inviter_id: number | null;
    created_at: Date;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "account_users",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "account_users",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const accountUsersSync: TableSync = {
  tableName: "account_users",
  cursorStrategy: "updated_at",
  run,
};
