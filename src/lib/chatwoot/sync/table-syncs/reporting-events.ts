import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `reporting_events` do Chatwoot.
 *
 * Cursor: `updated_at`. Tabela tem `account_id` direto. Eventos são imutáveis
 * em geral, mas seguimos `updated_at` para suportar reprocessamentos do
 * Chatwoot.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "reporting_events");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT id, account_id, name, value, conversation_id, user_id, event_start_time, event_end_time, created_at, updated_at
    FROM reporting_events
    WHERE account_id = $1
      AND updated_at > $2
    ORDER BY updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    name: string;
    value: number | null;
    conversation_id: number | null;
    user_id: number | null;
    event_start_time: Date | null;
    event_end_time: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "reporting_events",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "reporting_events",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const reportingEventsSync: TableSync = {
  tableName: "reporting_events",
  cursorStrategy: "updated_at",
  run,
};
