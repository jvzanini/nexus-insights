"use server";

/**
 * Server Action — snapshot de saúde da connection no contexto polling delta.
 *
 * Substitui webhook metrics (Fase 2 webhook removido em v0.41). Mostra:
 *  - lastSyncAt (heartbeat do polling delta — timestamp do último sync OK)
 *  - lastSyncLagMinutes (now - lastSyncAt em minutos; null se nunca rodou)
 *  - syncRunsLast24h (audit polling_sync_completed em 24h × 100;
 *    multiplicação cobre o sample 1/100 do worker — vide processDeltaSyncJob)
 *  - syncErrorsLast24h (audit polling_sync_failed em 24h, sem amostragem)
 *  - jobErrorsLast24h (chatwoot_facts_meta com lastError != null em 24h)
 *
 * Defesa em profundidade: super_admin only.
 *
 * Performance: 1 findUnique + 3 counts em paralelo (Promise.all).
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ConnectionHealthSnapshot {
  connectionId: string;
  lastSyncAt: string | null;
  lastSyncLagMinutes: number | null;
  syncRunsLast24h: number; // estimativa (sample 1/100)
  syncErrorsLast24h: number;
  jobErrorsLast24h: number;
}

export interface HealthSnapshotResult {
  success: boolean;
  data?: ConnectionHealthSnapshot;
  error?: string;
}

const AUDIT_SAMPLE_RATE = 100;

export async function getConnectionHealthSnapshot(
  connectionId: string,
): Promise<HealthSnapshotResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Não autenticado." };
  }
  if (user.platformRole !== "super_admin") {
    return {
      success: false,
      error: "Apenas super_admin pode consultar saúde da conexão.",
    };
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: connectionId, deletedAt: null },
    select: { id: true, lastSyncAt: true },
  });
  if (!conn) {
    return { success: false, error: "Conexão não encontrada." };
  }

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  const [syncRunsAuditCount, syncErrors, jobErrors] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "polling_sync_completed",
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: "polling_sync_failed",
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.chatwootFactsMeta.count({
      where: {
        connectionId,
        lastError: { not: null },
        updatedAt: { gte: last24h },
      },
    }),
  ]);

  // Audit é sample 1/100 → multiplica para estimativa real.
  const syncRunsLast24h = syncRunsAuditCount * AUDIT_SAMPLE_RATE;

  const lagMs = conn.lastSyncAt
    ? now.getTime() - conn.lastSyncAt.getTime()
    : null;
  const lagMin =
    lagMs !== null ? Math.max(0, Math.floor(lagMs / 60_000)) : null;

  return {
    success: true,
    data: {
      connectionId: conn.id,
      lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
      lastSyncLagMinutes: lagMin,
      syncRunsLast24h,
      syncErrorsLast24h: syncErrors,
      jobErrorsLast24h: jobErrors,
    },
  };
}
