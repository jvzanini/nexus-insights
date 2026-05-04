import type { Job } from "bullmq";
import { runFullSweep } from "@/lib/chatwoot/sync/run-full-sweep";
import { logAudit } from "@/lib/audit";

export interface FullSweepJobData {
  connectionId: string;
}

/**
 * BullMQ processor: full sweep diário para 1 connection.
 *
 * Disparo: cron 03:00 BRT (queue `chatwoot-sync-sweep-cron` → dispatcher
 * enfileira 1 sweep job por connection ativa pra queue `chatwoot-sync-sweep`).
 *
 * Auditoria: 100% (eventos raros — uma vez por dia por conn).
 *   - polling_full_sweep_started: antes do run.
 *   - polling_full_sweep_completed: após o run (mesmo com erros parciais).
 */
export async function processFullSweepJob(
  job: Job<FullSweepJobData>,
): Promise<void> {
  const { connectionId } = job.data;

  await logAudit({
    action: "polling_full_sweep_started",
    targetType: "nexus_chat_connection",
    targetId: connectionId,
    details: { jobId: job.id ?? null },
  }).catch(() => {});

  const summary = await runFullSweep(connectionId);

  await logAudit({
    action: "polling_full_sweep_completed",
    targetType: "nexus_chat_connection",
    targetId: connectionId,
    details: {
      durationMs: summary.totalDurationMs,
      tables: summary.perTable.length,
      errors: summary.errors.length,
    },
  }).catch(() => {});
}
