import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const ID_ZERO = BigInt(0);

/**
 * Sync delta de `team_members` do Chatwoot.
 *
 * Cursor: `id` (tabela append-only, sem `updated_at`). Como `team_members`
 * não tem `account_id` direto, fazemos JOIN com `teams` e filtramos por
 * `t.account_id`.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "team_members");
  const sinceId = cursor.lastSyncedId ?? ID_ZERO;

  const sql = `
    SELECT tm.id, tm.user_id, tm.team_id, t.account_id
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    WHERE t.account_id = $1
      AND tm.id > $2
    ORDER BY tm.id ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: string | number | bigint;
    user_id: number;
    team_id: number;
    account_id: number;
  }>(connectionId, sql, [accountId, sinceId]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "team_members",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextId = BigInt(last.id as never);

  return {
    tableName: "team_members",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "id", value: nextId },
    durationMs,
  };
}

export const teamMembersSync: TableSync = {
  tableName: "team_members",
  cursorStrategy: "id",
  run,
};
