"use server";

/**
 * Server Action — stream de eventos webhook recentes da connection.
 *
 * Uso na Aba 2 "Tempo real" (`/bancos-de-dados/[id]?tab=tempo-real`).
 * Lê audit logs com `action LIKE 'webhook_%'` filtrados por connection
 * (targetType = "nexus_chat_connection", targetId = connectionId), em ordem
 * desc por createdAt.
 *
 * Defesa em profundidade:
 *  - Apenas super_admin (UI já redireciona, mas Server Action nunca confia
 *    só na UI).
 *  - Limit cap em 500 (proteção contra request manipulada).
 *
 * Não inclui webhook_token_regenerated nem webhook_secret_regenerated do
 * filtro startsWith — esses também atendem a regra "webhook_*" e são
 * relevantes pro stream de tempo real (mostra quando alguém regenerou).
 */

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
      action: { startsWith: "webhook_" },
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
