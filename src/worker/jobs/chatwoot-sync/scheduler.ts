import { prisma } from "@/lib/prisma";
import { getDeltaSyncQueue } from "./queues";

/**
 * Tamanho do bucket para `jobId` determinístico do delta-sync.
 *
 * Por quê? O scheduler é chamado pelo Worker da queue `chatwoot-sync-delta-tick`
 * a cada 5s via JobScheduler. Se 2 ticks dispararem dentro do mesmo bucket,
 * o `jobId = delta:<connId>:<bucket>` é igual e BullMQ rejeita o segundo
 * (idempotência out-of-the-box).
 */
const TICK_BUCKET_MS = 5000;

interface DueConnection {
  id: string;
}

/**
 * Tick do scheduler: enfileira 1 job delta-sync por connection que está
 * devida (last_sync_at + polling_interval_seconds × 1s ≤ NOW()).
 *
 * Filtros:
 *   - deleted_at IS NULL  → conexão não foi soft-deleted.
 *   - status = 'active'   → conexão habilitada (não pausada/erro).
 *   - last_sync_at NULL OU + interval ≤ now → conn nunca rodou OU está atrasada.
 *
 * Ordenação NULLS FIRST: conn novinha (sem lastSyncAt) entra antes pra
 * "quebrar a casca" rapidamente, dando feedback imediato de health na UI.
 *
 * `jobId` determinístico: `delta:<connId>:<bucket>` com bucket de 5s.
 * Se 2 ticks colidirem dentro do mesmo bucket, BullMQ silenciosamente
 * descarta o duplicado (esperado — idempotência).
 */
export async function tickDeltaSyncScheduler(): Promise<void> {
  const due = await prisma.$queryRaw<DueConnection[]>`
    SELECT id
    FROM nexus_chat_connections
    WHERE deleted_at IS NULL
      AND status = 'active'
      AND (
        last_sync_at IS NULL
        OR last_sync_at + (polling_interval_seconds * INTERVAL '1 second') <= NOW()
      )
    ORDER BY last_sync_at NULLS FIRST
  `;

  if (due.length === 0) return;

  const queue = getDeltaSyncQueue();
  const bucket = Math.floor(Date.now() / TICK_BUCKET_MS);

  for (const row of due) {
    await queue
      .add(
        "delta-sync",
        { connectionId: row.id },
        { jobId: `delta:${row.id}:${bucket}` },
      )
      .catch(() => {
        // jobId duplicado dentro do mesmo bucket → BullMQ rejeita.
        // Esperado quando 2 ticks colidem; silenciar.
      });
  }
}
