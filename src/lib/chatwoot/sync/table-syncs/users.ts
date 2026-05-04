import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `users` do Chatwoot.
 *
 * Cursor: `users.updated_at`. Como `users` é global (sem account_id), fazemos
 * JOIN com `account_users` para filtrar apenas usuários membros da account.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "users");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT u.id, u.name, u.email, u.role, u.created_at, u.updated_at, au.account_id
    FROM users u
    JOIN account_users au ON au.user_id = u.id
    WHERE au.account_id = $1
      AND u.updated_at > $2
    ORDER BY u.updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    name: string;
    email: string;
    role: number;
    created_at: Date;
    updated_at: Date;
    account_id: number;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "users",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "users",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const usersSync: TableSync = {
  tableName: "users",
  cursorStrategy: "updated_at",
  run,
};
