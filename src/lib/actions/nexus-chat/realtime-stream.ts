"use server";

/**
 * Server Action — stream de eventos webhook recentes da connection.
 *
 * Uso na Aba 2 "Tempo real" (`/bancos-de-dados/[id]?tab=tempo-real`).
 * Lê audit logs com `action IN (webhook_*)` filtrados por connection
 * (targetType = "nexus_chat_connection", targetId = connectionId), em ordem
 * desc por createdAt.
 *
 * Defesa em profundidade:
 *  - Apenas super_admin (UI já redireciona, mas Server Action nunca confia
 *    só na UI).
 *  - Limit cap em 500 (proteção contra request manipulada).
 *
 * Inclui webhook_token_regenerated e webhook_secret_regenerated (eventos
 * administrativos relevantes no stream).
 *
 * Nota: Prisma enum filter não suporta `startsWith`, então usamos `in`
 * com a lista explícita das 6 ações webhook_* do AuditAction enum.
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AuditAction } from "@/generated/prisma/client";

const WEBHOOK_ACTIONS: AuditAction[] = [
  "webhook_received",
  "webhook_rejected_hmac",
  "webhook_rejected_rate_limit",
  "webhook_no_binding",
  "webhook_token_regenerated",
  "webhook_secret_regenerated",
];

export interface WebhookEvent {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface RealtimeStreamResult {
  success: boolean;
  data?: WebhookEvent[];
  error?: string;
}

export async function listRecentWebhookEvents(args: {
  connectionId: string;
  limit?: number;
}): Promise<RealtimeStreamResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Não autenticado." };
  }
  if (user.platformRole !== "super_admin") {
    return {
      success: false,
      error: "Apenas super_admin pode consultar eventos webhook.",
    };
  }

  // Cap em 500 mesmo se limit for maior, e default 200.
  const requested = args.limit ?? 200;
  const limit = Math.max(1, Math.min(requested, 500));

  const rows = await prisma.auditLog.findMany({
    where: {
      action: { in: WEBHOOK_ACTIONS },
      targetType: "nexus_chat_connection",
      targetId: args.connectionId,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
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
