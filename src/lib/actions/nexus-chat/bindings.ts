"use server";

/**
 * Server Actions de `company_chat_bindings` — CRUD super_admin only.
 *
 * Constraint operacional crítico (createCompanyChatBinding):
 *   Bloqueia criar binding com `chatwoot_account_id` que já existe em outra
 *   `nexus_chat_connection` enabled. Sem essa validação, `getActiveConnectionId`
 *   ficaria ambíguo (mesma `account_id` em 2 connections) e poderia vazar
 *   dados entre tenants. Constraint pode ser relaxada quando UAA virar
 *   UserBindingAccess (ver Q1 da spec §22).
 */

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const CreateBindingSchema = z.object({
  connectionId: z.string().uuid(),
  chatwootAccountId: z.number().int().positive(),
  displayName: z.string().min(1).max(150),
  enabled: z.boolean().default(true),
});

const UpdateBindingSchema = z.object({
  displayName: z.string().min(1).max(150).optional(),
  enabled: z.boolean().optional(),
});

export type CompanyChatBindingInput = z.input<typeof CreateBindingSchema>;
export type CompanyChatBindingUpdate = z.input<typeof UpdateBindingSchema>;

async function requireSuperAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Apenas super_admin pode gerenciar empresas." };
  }
  return { ok: true, userId: user.id };
}

export async function createCompanyChatBinding(
  input: CompanyChatBindingInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = CreateBindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const conn = await prisma.nexusChatConnection.findUnique({
    where: { id: parsed.data.connectionId, deletedAt: null },
  });
  if (!conn) {
    return { success: false, error: "Conexão não encontrada ou foi removida." };
  }

  // Constraint operacional: account_id deve ser único entre connections enabled.
  // Sem essa validação, getActiveConnectionId ficaria ambíguo (AmbiguousBindingError).
  const conflicting = await prisma.companyChatBinding.findMany({
    where: {
      chatwootAccountId: parsed.data.chatwootAccountId,
      connectionId: { not: parsed.data.connectionId },
      enabled: true,
      deletedAt: null,
    },
    select: { id: true, connectionId: true },
  });
  if (conflicting.length > 0) {
    const otherConns = conflicting.map((b) => b.connectionId).join(", ");
    return {
      success: false,
      error: `Já existe uma empresa cadastrada com account_id=${parsed.data.chatwootAccountId} em outra conexão (${otherConns}). Migre UserAccountAccess para UserBindingAccess antes (Q1 da spec).`,
    };
  }

  const binding = await prisma.companyChatBinding.create({
    data: {
      connectionId: parsed.data.connectionId,
      chatwootAccountId: parsed.data.chatwootAccountId,
      displayName: parsed.data.displayName,
      enabled: parsed.data.enabled,
      createdById: auth.userId,
    },
  });

  await logAudit({
    userId: auth.userId,
    action: "company_chat_binding_created",
    targetType: "company_chat_binding",
    targetId: binding.id,
    details: {
      connectionId: parsed.data.connectionId,
      chatwootAccountId: parsed.data.chatwootAccountId,
      displayName: parsed.data.displayName,
    },
  });

  return { success: true, data: { id: binding.id } };
}

export async function updateCompanyChatBinding(
  id: string,
  input: CompanyChatBindingUpdate,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = UpdateBindingSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const before = await prisma.companyChatBinding.findUnique({ where: { id } });
  if (!before) return { success: false, error: "Binding não encontrado." };

  await prisma.companyChatBinding.update({
    where: { id },
    data: parsed.data,
  });

  await logAudit({
    userId: auth.userId,
    action: "company_chat_binding_updated",
    targetType: "company_chat_binding",
    targetId: id,
    details: {
      before: { displayName: before.displayName, enabled: before.enabled },
      after: parsed.data,
    },
  });

  return { success: true };
}

export async function softDeleteCompanyChatBinding(
  id: string,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const binding = await prisma.companyChatBinding.findUnique({ where: { id } });
  if (!binding) return { success: false, error: "Binding não encontrado." };

  await prisma.companyChatBinding.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    userId: auth.userId,
    action: "company_chat_binding_deleted",
    targetType: "company_chat_binding",
    targetId: id,
    details: {
      connectionId: binding.connectionId,
      chatwootAccountId: binding.chatwootAccountId,
    },
  });

  return { success: true };
}
