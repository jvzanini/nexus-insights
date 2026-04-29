import { prisma } from "./prisma";
import type { AuditAction } from "@/generated/prisma/client";

export interface LogAuditParams {
  userId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Registra uma entrada no audit log.
 *
 * Fire-and-forget: erros são logados no console mas não propagados,
 * para não interromper o fluxo principal.
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        details: params.details as object | undefined,
      },
    });
  } catch (error) {
    console.error("[audit] Falha ao registrar audit log:", error);
  }
}
