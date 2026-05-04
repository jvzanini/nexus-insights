import type { Job } from "bullmq";
import { runDeltaSync } from "@/lib/chatwoot/sync/run-delta-sync";
import { logAudit } from "@/lib/audit";

export interface DeltaSyncJobData {
  connectionId: string;
}

/**
 * Sample rate para audit `polling_sync_completed` — 1 a cada 100 runs.
 *
 * Volume esperado: ~2 runs/min/conn (intervalo padrão 30s) → com 10 conns
 * ativas seria ~28k runs/dia. Logar 100% encheria audit_logs com ruído.
 * Erros (raros) sempre são logados.
 */
const AUDIT_SAMPLE_RATE = 100;

/**
 * BullMQ processor: executa delta-sync para 1 connection.
 *
 * Idempotência: garantida pelo scheduler via `jobId` determinístico
 * (`delta:<connId>:<bucket>` com bucket = floor(now/5s)).
 *
 * Erros do `runDeltaSync` (probe falhou, table-syncs individuais falharam)
 * NÃO propagam — `runDeltaSync` já registra os erros em `cursor.lastError`.
 * Apenas erros não-recuperáveis (throw fora de runDeltaSync) propagam pra
 * retry BullMQ.
 *
 * Auditoria:
 *   - polling_sync_failed: 100% (erros são raros e merecem log integral)
 *   - polling_sync_completed: sample 1/100, com `details` enxutos
 *     (durationMs, totalRows, topTables top 3, hadChanges) — versão
 *     Apêndice C para evitar JSON gigante em audit_logs.
 */
export async function processDeltaSyncJob(
  job: Job<DeltaSyncJobData>,
): Promise<void> {
  const { connectionId } = job.data;
  const summary = await runDeltaSync(connectionId);

  if (summary.errors.length > 0) {
    await logAudit({
      action: "polling_sync_failed",
      targetType: "nexus_chat_connection",
      targetId: connectionId,
      details: {
        durationMs: summary.totalDurationMs,
        // Cap em 10 erros pra não bloating audit_logs com JSONs gigantes.
        errors: summary.errors.slice(0, 10),
        errorCount: summary.errors.length,
      },
    }).catch(() => {
      // Audit não pode quebrar o worker.
    });
    return;
  }

  if (Math.random() < 1 / AUDIT_SAMPLE_RATE) {
    await logAudit({
      action: "polling_sync_completed",
      targetType: "nexus_chat_connection",
      targetId: connectionId,
      details: {
        durationMs: summary.totalDurationMs,
        totalRows: summary.perTable.reduce(
          (sum, t) => sum + t.rowsAffected,
          0,
        ),
        topTables: summary.perTable
          .slice()
          .sort((a, b) => b.rowsAffected - a.rowsAffected)
          .slice(0, 3)
          .map((t) => ({ table: t.tableName, rows: t.rowsAffected })),
        hadChanges: summary.hadChanges,
      },
    }).catch(() => {});
  }
}
