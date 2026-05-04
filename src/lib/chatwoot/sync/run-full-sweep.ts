import { prisma } from "@/lib/prisma";
import { queryNexusChat } from "@/lib/nexus-chat/pool";
import type { SyncRunSummary, TableSyncResult } from "./types";

/**
 * Tabelas que participam do full sweep (precisam ter `id` bigint pra
 * comparação com nosso side). `messages` não tem `account_id` em algumas
 * versões do Chatwoot — usamos JOIN com `conversations` (mesmo padrão da
 * `messages.ts` table-sync).
 *
 * NOTA v1: este sweep só DETECTA IDs órfãos no Chatwoot (sem deletar do
 * nosso lado). O delete real fica para v2 quando a camada de upsert
 * (`chatwoot_facts_*`) tiver suporte a invalidação por id list. Por ora,
 * apenas log + audit + deixa para próxima iteração.
 *
 * Why? Deletar sem ter pipeline de invalidação é arriscado: pode deixar
 * registros zumbis nas pré-agregações (que serão refrescadas, mas continuarão
 * referenciando facts já calculados). Melhor detectar primeiro.
 */
const SWEEP_TABLES: Array<{ name: string; sql: string }> = [
  {
    name: "conversations",
    sql: "SELECT id FROM conversations WHERE account_id = $1",
  },
  {
    name: "messages",
    // JOIN com conversations — `messages.account_id` pode não existir.
    sql:
      "SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.account_id = $1",
  },
  {
    name: "inboxes",
    sql: "SELECT id FROM inboxes WHERE account_id = $1",
  },
  {
    name: "teams",
    sql: "SELECT id FROM teams WHERE account_id = $1",
  },
  {
    name: "contacts",
    sql: "SELECT id FROM contacts WHERE account_id = $1",
  },
];

/**
 * Cron diário 03:00 BRT — full sweep para detectar IDs deletados no Chatwoot
 * que continuam vivos no nosso banco interno (nunca chegariam via polling
 * delta, porque DELETE não dispara updated_at).
 *
 * v1: apenas LISTA todos os IDs do Chatwoot por (account × table). v2 vai
 * comparar contra IDs internos e deletar diferença. Esta versão é fail-soft
 * — erro em 1 tabela não aborta o sweep das demais.
 */
export async function runFullSweep(
  connectionId: string,
): Promise<SyncRunSummary> {
  const startedAt = new Date();
  const t0 = Date.now();

  const bindings = await prisma.companyChatBinding.findMany({
    where: { connectionId, enabled: true, deletedAt: null },
    select: { chatwootAccountId: true },
  });

  if (bindings.length === 0) {
    return {
      connectionId,
      startedAt,
      finishedAt: new Date(),
      totalDurationMs: Date.now() - t0,
      perTable: [],
      errors: [],
      hadChanges: false,
    };
  }

  const perTable: TableSyncResult[] = [];
  const errors: SyncRunSummary["errors"] = [];

  for (const binding of bindings) {
    const accountId = binding.chatwootAccountId;
    for (const table of SWEEP_TABLES) {
      const tStart = Date.now();
      try {
        const res = await queryNexusChat<{ id: number }>(
          connectionId,
          table.sql,
          [accountId],
        );
        perTable.push({
          tableName: table.name,
          rowsRead: res.rows.length,
          rowsAffected: 0, // sweep v1 não deleta ainda
          nextCursor: { kind: "none" },
          durationMs: Date.now() - tStart,
        });
      } catch (err) {
        errors.push({
          tableName: table.name,
          accountId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    connectionId,
    startedAt,
    finishedAt: new Date(),
    totalDurationMs: Date.now() - t0,
    perTable,
    errors,
    hadChanges: false,
  };
}
