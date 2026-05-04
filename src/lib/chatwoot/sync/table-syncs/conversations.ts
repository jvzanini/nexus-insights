import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `conversations` do Chatwoot.
 *
 * Cursor: `updated_at`. Tabela `conversations` no Chatwoot atualiza updated_at
 * em qualquer mudança de status, assignee, team, custom_attributes, etc.
 *
 * O upsert efetivo no nosso banco interno acontece via camada de pré-agregação
 * (chatwoot_facts_*) — esta função apenas detecta as mudanças e dispara
 * o refresh via worker BullMQ. Esta função não escreve em chatwoot_facts_*
 * diretamente; apenas valida que há mudança e retorna `rowsRead`.
 *
 * Por design, `rowsAffected` aqui = `rowsRead` (assumimos que tudo lido é
 * mudança nova, dado que filtramos por updated_at > cursor).
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "conversations");
  const since = cursor.lastSyncedAt ?? EPOCH;

  const sql = `
    SELECT id, account_id, status, updated_at
    FROM conversations
    WHERE account_id = $1
      AND updated_at > $2
    ORDER BY updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    status: number;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "conversations",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "conversations",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const conversationsSync: TableSync = {
  tableName: "conversations",
  cursorStrategy: "updated_at",
  run,
};
