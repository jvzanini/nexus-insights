import { prisma } from "@/lib/prisma";
import { queryNexusChat } from "@/lib/nexus-chat/pool";
import {
  refreshByAccountQueue,
  refreshByAgentQueue,
  refreshByInboxQueue,
  refreshByTeamQueue,
} from "@/lib/queue";
import { advanceCursor, recordCursorError } from "./cursor";
import { TABLE_SYNCS } from "./table-syncs";
import type { SyncRunSummary, TableSyncResult } from "./types";

/**
 * Executa polling delta sync para 1 conexão.
 *
 * Fluxo (Apêndice C — v3 OVERRIDES):
 *   1. Probe `SELECT 1` antes de tudo. Se a conn estiver fora do ar, devolve
 *      summary com 1 erro `*probe*` e zero work — evita NxM falhas em cascata.
 *   2. Valida que a connection ainda existe (`deletedAt IS NULL`). Conexão
 *      pode ter sido deletada entre o scheduler enfileirar o job e o worker
 *      pegar — devolve zero summary silenciosamente.
 *   3. Para cada (binding × table-sync) chama `sync.run()`. Em sucesso avança
 *      cursor (timestamp ou id). Em erro grava em `cursor.lastError` sem
 *      abortar o run.
 *   4. Para cada account com `rowsAffected > 0`, ENFILEIRA jobs `refresh-by-*`
 *      da pré-agregação (em vez de publicar `facts:refreshed` direto). Os
 *      próprios jobs publicam o evento ao terminarem o upsert das tabelas
 *      `chatwoot_facts_*`. Latência fim-a-fim ≈ pollingIntervalSeconds + 5–10s.
 *   5. Atualiza `connection.lastSyncAt` ao final (best-effort) — sucesso
 *      parcial vale como heartbeat para a UI de "Saúde".
 */
export async function runDeltaSync(
  connectionId: string,
): Promise<SyncRunSummary> {
  const startedAt = new Date();
  const t0 = Date.now();

  // 1. Probe — se a conn está fora, falha rápido sem N×M ruído nos cursors.
  try {
    await queryNexusChat(connectionId, "SELECT 1", []);
  } catch (err) {
    return {
      connectionId,
      startedAt,
      finishedAt: new Date(),
      totalDurationMs: Date.now() - t0,
      perTable: [],
      errors: [
        {
          tableName: "*probe*",
          accountId: 0,
          error: err instanceof Error ? err.message : String(err),
        },
      ],
      hadChanges: false,
    };
  }

  // 2. Connection ainda existe? (race contra delete)
  const conn = await prisma.nexusChatConnection.findFirst({
    where: { id: connectionId, deletedAt: null },
    select: { id: true },
  });
  if (!conn) {
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

  const bindings = await prisma.companyChatBinding.findMany({
    where: { connectionId, enabled: true, deletedAt: null },
    select: { chatwootAccountId: true, displayName: true },
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
  const accountsChanged = new Set<number>();

  // 3. Loop bindings × tables — error-isolated.
  for (const binding of bindings) {
    const accountId = binding.chatwootAccountId;
    for (const sync of TABLE_SYNCS) {
      try {
        const result = await sync.run({ connectionId, accountId });
        perTable.push(result);

        if (result.nextCursor.kind === "timestamp") {
          await advanceCursor(connectionId, accountId, sync.tableName, {
            lastSyncedAt: result.nextCursor.value,
            rowsAffected: result.rowsAffected,
            runMs: result.durationMs,
          });
          if (result.rowsAffected > 0) accountsChanged.add(accountId);
        } else if (result.nextCursor.kind === "id") {
          await advanceCursor(connectionId, accountId, sync.tableName, {
            lastSyncedId: result.nextCursor.value,
            rowsAffected: result.rowsAffected,
            runMs: result.durationMs,
          });
          if (result.rowsAffected > 0) accountsChanged.add(accountId);
        }
        // kind === "none": sem cursor para avançar; não conta como mudança.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ tableName: sync.tableName, accountId, error: msg });
        const elapsedMs = Date.now() - t0;
        await recordCursorError(
          connectionId,
          accountId,
          sync.tableName,
          err,
          elapsedMs,
        ).catch(() => {
          // Falha ao gravar erro não pode quebrar o run.
        });
      }
    }
  }

  // 4. ENFILEIRAR refresh-by-* (em vez de publicar facts:refreshed direto).
  // Cada job atualiza chatwoot_facts_* + publica facts:refreshed via withMetaUpdate.
  // Sistema atual tem 4 queues (by_account cobre by_account E hourly_by_account
  // no mesmo job — não há queue separada de hourly).
  for (const accountId of Array.from(accountsChanged)) {
    const ts = Date.now();
    await Promise.allSettled([
      refreshByAccountQueue.add(
        "delta-trigger",
        { connectionId, accountId },
        { jobId: `delta-by-account:${connectionId}:${accountId}:${ts}` },
      ),
      refreshByInboxQueue.add(
        "delta-trigger",
        { connectionId, accountId },
        { jobId: `delta-by-inbox:${connectionId}:${accountId}:${ts}` },
      ),
      refreshByAgentQueue.add(
        "delta-trigger",
        { connectionId, accountId },
        { jobId: `delta-by-agent:${connectionId}:${accountId}:${ts}` },
      ),
      refreshByTeamQueue.add(
        "delta-trigger",
        { connectionId, accountId },
        { jobId: `delta-by-team:${connectionId}:${accountId}:${ts}` },
      ),
    ]);
  }

  // 5. Heartbeat: atualiza lastSyncAt mesmo com erros parciais.
  await prisma.nexusChatConnection
    .update({
      where: { id: connectionId },
      data: { lastSyncAt: new Date() },
    })
    .catch(() => {
      // Connection pode ter sido deletada durante o run. Não quebrar.
    });

  return {
    connectionId,
    startedAt,
    finishedAt: new Date(),
    totalDurationMs: Date.now() - t0,
    perTable,
    errors,
    hadChanges: accountsChanged.size > 0,
  };
}
