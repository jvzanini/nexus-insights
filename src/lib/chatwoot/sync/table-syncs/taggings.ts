import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const ID_ZERO = BigInt(0);

/**
 * Sync delta de `taggings` do Chatwoot.
 *
 * Cursor: `id` (tabela append-only, sem `updated_at`).
 *
 * `taggings` é polimórfica (`taggable_type` pode ser Conversation, Contact,
 * etc). Filtramos apenas `taggable_type = 'Conversation'` e fazemos JOIN com
 * `conversations` para obter `account_id` (taggings não tem account_id direto).
 *
 * O JOIN com `tags` valida que a tag existe e permite que pré-agregação use
 * o nome da tag depois.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "taggings");
  const sinceId = cursor.lastSyncedId ?? ID_ZERO;

  const sql = `
    SELECT tg.id, tg.tag_id, tg.taggable_id, tg.taggable_type, c.account_id
    FROM taggings tg
    JOIN tags tag_def ON tag_def.id = tg.tag_id
    JOIN conversations c ON c.id = tg.taggable_id AND tg.taggable_type = 'Conversation'
    WHERE c.account_id = $1
      AND tg.id > $2
    ORDER BY tg.id ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: string | number | bigint;
    tag_id: number;
    taggable_id: number;
    taggable_type: string;
    account_id: number;
  }>(connectionId, sql, [accountId, sinceId]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "taggings",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextId = BigInt(last.id as never);

  return {
    tableName: "taggings",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "id", value: nextId },
    durationMs,
  };
}

export const taggingsSync: TableSync = {
  tableName: "taggings",
  cursorStrategy: "id",
  run,
};
