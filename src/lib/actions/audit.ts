"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { AuditAction } from "@/generated/prisma/client";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export interface AuditLogRow {
  id: string;
  action: AuditAction;
  userName: string | null;
  userEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  details: unknown;
  createdAt: Date;
}

interface ListAuditsArgs {
  cursor?: string | null;
  filterAction?: AuditAction | null;
  filterUserId?: string | null;
  limit?: number;
}

interface CursorPayload {
  createdAt: string;
  id: string;
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    const parsed = JSON.parse(json) as CursorPayload;
    if (!parsed?.createdAt || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function listAudits(
  args: ListAuditsArgs,
): Promise<ActionResult<{ rows: AuditLogRow[]; nextCursor: string | null }>> {
  try {
    const me = await getCurrentUser();
    if (!me) return { success: false, error: "Não autenticado" };
    if (me.platformRole !== "super_admin") {
      return { success: false, error: "Acesso negado" };
    }

    const requestedLimit = args.limit ?? 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 200);

    const decoded = args.cursor ? decodeCursor(args.cursor) : null;

    const where: Record<string, unknown> = {};
    if (args.filterAction) where.action = args.filterAction;
    if (args.filterUserId) where.userId = args.filterUserId;

    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      where.OR = [
        { createdAt: { lt: cursorDate } },
        {
          AND: [
            { createdAt: cursorDate },
            { id: { lt: decoded.id } },
          ],
        },
      ];
    }

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        details: true,
        createdAt: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const sliced = hasMore ? rows.slice(0, limit) : rows;

    const data: AuditLogRow[] = sliced.map((r) => ({
      id: r.id,
      action: r.action,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      targetType: r.targetType,
      targetId: r.targetId,
      ipAddress: r.ipAddress,
      details: r.details,
      createdAt: r.createdAt,
    }));

    let nextCursor: string | null = null;
    if (hasMore && sliced.length > 0) {
      const last = sliced[sliced.length - 1];
      nextCursor = encodeCursor({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      });
    }

    return { success: true, data: { rows: data, nextCursor } };
  } catch (err) {
    console.error("[audit.list]", err);
    return { success: false, error: "Erro ao listar auditoria" };
  }
}
