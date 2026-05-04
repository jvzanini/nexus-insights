"use server";

/**
 * Server Action — lista runs recentes do polling delta para uma connection.
 * Substitui `listRecentWebhookEvents` (Fase 2 webhook, removido em v0.41).
 *
 * Origem: `audit_logs` com action ∈ {
 *   polling_sync_completed,
 *   polling_sync_failed,
 *   polling_full_sweep_started,
 *   polling_full_sweep_completed,
 *   polling_interval_updated,
 * }.
 *
 * Defesa em profundidade: super_admin only.
 * Cap LIMIT 500 (proteção contra request manipulada).
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/generated/prisma/client";

export interface SyncRunEvent {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface SyncStreamResult {
  success: boolean;
  data?: SyncRunEvent[];
  error?: string;
}

const POLLING_AUDIT_ACTIONS: AuditAction[] = [
  "polling_sync_completed",
  "polling_sync_failed",
  "polling_full_sweep_started",
  "polling_full_sweep_completed",
  "polling_interval_updated",
];

const HARD_LIMIT = 500;

export async function listRecentSyncRuns(args: {
  connectionId: string;
  limit: number;
}): Promise<SyncStreamResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Não autenticado." };
  }
  if (user.platformRole !== "super_admin") {
    return {
      success: false,
      error: "Apenas super_admin pode consultar histórico de sync.",
    };
  }

  const take = Math.min(Math.max(1, args.limit), HARD_LIMIT);

  const rows = await prisma.auditLog.findMany({
    where: {
      targetType: "nexus_chat_connection",
      targetId: args.connectionId,
      action: { in: POLLING_AUDIT_ACTIONS },
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      action: true,
      createdAt: true,
      details: true,
    },
  });

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      action: r.action as string,
      createdAt: r.createdAt.toISOString(),
      details: (r.details as Record<string, unknown> | null) ?? {},
    })),
  };
}
