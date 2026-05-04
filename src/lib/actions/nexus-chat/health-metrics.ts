"use server";

/**
 * Server Action — snapshot de saúde da connection (heartbeat + contadores 24h).
 *
 * Uso na Aba 4 "Saúde" (`/bancos-de-dados/[id]?tab=saude`).
 * Combina:
 *  - lastWebhookAt direto da `nexus_chat_connections` (grava no endpoint
 *    webhook a cada POST válido).
 *  - Contadores 24h em `audit_logs` (webhook_received, webhook_rejected_*).
 *  - Contagem de jobs com erro em `chatwoot_facts_meta` da connection nas
 *    últimas 24h (lastError != null AND updatedAt >= now-24h).
 *
 * Defesa em profundidade: super_admin only.
 *
 * Performance: 3 queries em paralelo (Promise.all) + 1 findUnique.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export interface ConnectionHealthSnapshot {
  connectionId: string;
  lastWebhookAt: string | null;
  lastWebhookLagMinutes: number | null;
  webhooksLast24h: number;
  errorsLast24h: number;
  jobErrorsLast24h: number;
}

export interface HealthSnapshotResult {
  success: boolean;
  data?: ConnectionHealthSnapshot;
  error?: string;
}

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
    select: { id: true, lastWebhookAt: true },
  });
  if (!conn) {
    return { success: false, error: "Conexão não encontrada." };
  }

  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 3600_000);

  const [webhooks24h, errors24h, jobErrors] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: "webhook_received",
        targetType: "nexus_chat_connection",
        targetId: connectionId,
        createdAt: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: { in: ["webhook_rejected_hmac", "webhook_rejected_rate_limit"] },
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

  const lagMs = conn.lastWebhookAt
    ? now.getTime() - conn.lastWebhookAt.getTime()
    : null;
  const lagMin = lagMs !== null ? Math.max(0, Math.floor(lagMs / 60_000)) : null;

  return {
    success: true,
    data: {
      connectionId: conn.id,
      lastWebhookAt: conn.lastWebhookAt?.toISOString() ?? null,
      lastWebhookLagMinutes: lagMin,
      webhooksLast24h: webhooks24h,
      errorsLast24h: errors24h,
      jobErrorsLast24h: jobErrors,
    },
  };
}
