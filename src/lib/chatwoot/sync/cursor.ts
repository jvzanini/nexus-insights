import { prisma } from "@/lib/prisma";

export interface SyncCursor {
  id: string;
  connectionId: string;
  accountId: number;
  tableName: string;
  lastSyncedAt: Date | null;
  lastSyncedId: bigint | null;
  rowsSynced: bigint;
  lastRunMs: number | null;
  lastError: string | null;
  lastErrorAt: Date | null;
}

interface AdvanceArgs {
  lastSyncedAt?: Date;
  lastSyncedId?: bigint;
  rowsAffected: number;
  runMs: number;
}

const MAX_ERROR_LEN = 1000;

/**
 * Lê cursor `(connectionId, accountId, tableName)`. Se não existir, cria
 * com tudo null (delta-sync vai tratar null como "primeira execução" e
 * fazer backfill do horizonte definido pelo orquestrador).
 *
 * Usado por `run-delta-sync.ts` antes de cada tabela.
 */
export async function getOrCreateCursor(
  connectionId: string,
  accountId: number,
  tableName: string,
): Promise<SyncCursor> {
  const existing = await prisma.chatwootSyncCursor.findUnique({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
  });
  if (existing) return existing;

  return prisma.chatwootSyncCursor.create({
    data: { connectionId, accountId, tableName },
  });
}

/**
 * Avança cursor após sync bem-sucedido. Limpa lastError/lastErrorAt.
 * `lastSyncedAt` ou `lastSyncedId` (uma das duas; updated_at-based ou id-based).
 */
export async function advanceCursor(
  connectionId: string,
  accountId: number,
  tableName: string,
  args: AdvanceArgs,
): Promise<void> {
  const data: Record<string, unknown> = {
    rowsSynced: { increment: BigInt(args.rowsAffected) },
    lastRunMs: args.runMs,
    lastError: null,
    lastErrorAt: null,
  };
  if (args.lastSyncedAt) data.lastSyncedAt = args.lastSyncedAt;
  if (args.lastSyncedId) data.lastSyncedId = args.lastSyncedId;

  await prisma.chatwootSyncCursor.update({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
    data,
  });
}

/**
 * Grava erro no cursor sem perder estado de sucesso anterior.
 * Trunca mensagem em MAX_ERROR_LEN para evitar TEXT enormes.
 */
export async function recordCursorError(
  connectionId: string,
  accountId: number,
  tableName: string,
  error: unknown,
  runMs: number,
): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  const truncated =
    msg.length > MAX_ERROR_LEN ? msg.slice(0, MAX_ERROR_LEN) : msg;

  await prisma.chatwootSyncCursor.update({
    where: {
      connectionId_accountId_tableName: { connectionId, accountId, tableName },
    },
    data: {
      lastError: truncated,
      lastErrorAt: new Date(),
      lastRunMs: runMs,
    },
  });
}
