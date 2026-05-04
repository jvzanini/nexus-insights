import { queryNexusChat } from "@/lib/nexus-chat/pool";
import { getOrCreateCursor } from "../cursor";
import type { TableSync, TableSyncArgs, TableSyncResult } from "../types";

const DEFAULT_BATCH_LIMIT = 5000;
const EPOCH = new Date(0);

/**
 * Sync delta de `messages` do Chatwoot.
 *
 * Cursor: `updated_at`. Tabela `messages` em algumas versões do Chatwoot pode
 * NÃO ter coluna `account_id` direta — neste caso, usamos JOIN com
 * `conversations` (mais seguro). Se a versão tiver `messages.account_id`, o
 * JOIN ainda é correto (apenas levemente menos performático), e mantemos
 * apenas uma forma para evitar branching baseado em probe.
 *
 * O upsert efetivo no nosso banco interno acontece via camada de pré-agregação
 * (chatwoot_facts_*). Esta função apenas detecta delta e retorna `rowsRead`.
 */
async function run({
  connectionId,
  accountId,
  batchLimit = DEFAULT_BATCH_LIMIT,
}: TableSyncArgs): Promise<TableSyncResult> {
  const t0 = Date.now();
  const cursor = await getOrCreateCursor(connectionId, accountId, "messages");
  const since = cursor.lastSyncedAt ?? EPOCH;

  // Fallback JOIN com conversations — mais seguro porque vale tanto quando
  // `messages.account_id` existe quanto quando não existe.
  const sql = `
    SELECT m.id, c.account_id, m.conversation_id, m.message_type, m.content, m.private, m.created_at, m.updated_at
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.account_id = $1
      AND m.updated_at > $2
    ORDER BY m.updated_at ASC
    LIMIT ${Number(batchLimit)}
  `;

  const result = await queryNexusChat<{
    id: number;
    account_id: number;
    conversation_id: number;
    message_type: number;
    content: string | null;
    private: boolean;
    created_at: Date;
    updated_at: Date;
  }>(connectionId, sql, [accountId, since]);

  const rows = result.rows;
  const rowsRead = rows.length;
  const durationMs = Date.now() - t0;

  if (rowsRead === 0) {
    return {
      tableName: "messages",
      rowsRead: 0,
      rowsAffected: 0,
      nextCursor: { kind: "none" },
      durationMs,
    };
  }

  const last = rows[rows.length - 1]!;
  const nextTs = new Date(last.updated_at);

  return {
    tableName: "messages",
    rowsRead,
    rowsAffected: rowsRead,
    nextCursor: { kind: "timestamp", value: nextTs },
    durationMs,
  };
}

export const messagesSync: TableSync = {
  tableName: "messages",
  cursorStrategy: "updated_at",
  run,
};
