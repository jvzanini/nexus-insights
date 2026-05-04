import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `inboxes` do Chatwoot.
 *
 * Cursor: `updated_at`. Inboxes têm `account_id` direto. Polling apenas
 * detecta delta — pré-agregação atualiza chatwoot_facts_*.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "inboxes");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT id, account_id, name, channel_type, created_at, updated_at
    FROM inboxes
    WHERE account_id = $1
      AND updated_at > $2
    ORDER BY updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    name: string;
    channel_type: string;
    created_at: Date;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "inboxes",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "inboxes",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const inboxesSync: TableSync = {
  tableName: "inboxes",
  cursorStrategy: "updated_at",
  run,
};
