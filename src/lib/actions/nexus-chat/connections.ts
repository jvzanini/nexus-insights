"use server";

/**
 * Server Actions de `nexus_chat_connections` — CRUD super_admin only.
 *
 * Cada operação:
 *  1. Valida autenticação + role super_admin (defesa em profundidade — UI já
 *     redireciona em `/configuracoes/conexoes`, mas ações nunca confiam só
 *     na UI).
 *  2. Valida input via Zod.
 *  3. Cifra `password` via AES-256-GCM (nunca persistir em texto plano).
 *  4. Faz a operação Prisma.
 *  5. Pub/Sub: publica `connection:updated` ou `connection:deleted` para
 *     workers e clientes SSE invalidarem pool e propagarem UX.
 *  6. Audit log com `details` JSON contendo apenas metadata (jamais
 *     password em texto ou cifrado).
 */

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { publishRealtimeEvent } from "@/lib/realtime";
import {
  invalidateNexusChatPool,
  queryNexusChat,
} from "@/lib/nexus-chat/pool";
import { generateWebhookCredentials } from "@/lib/nexus-chat/webhook-credentials";

type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

const SslModeSchema = z.enum(["disable", "prefer", "require", "verify-full"]);

const ConnectionInputSchema = z.object({
  name: z.string().min(1, "Nome obrigatório").max(100),
  host: z.string().min(1, "Host obrigatório").max(255),
  port: z.number().int().min(1).max(65535).default(5432),
  database: z.string().min(1, "Banco obrigatório").max(100),
  username: z.string().min(1, "Usuário obrigatório").max(100),
  password: z.string().max(500), // vazio em update = manter
  sslMode: SslModeSchema.default("prefer"),
  applicationName: z.string().max(100).default("nexus-insights"),
});

export type NexusChatConnectionInput = z.input<typeof ConnectionInputSchema>;

async function requireSuperAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Não autenticado." };
  if (user.platformRole !== "super_admin") {
    return { ok: false, error: "Apenas super_admin pode gerenciar conexões." };
  }
  return { ok: true, userId: user.id };
}

export async function createNexusChatConnection(
  input: NexusChatConnectionInput,
): Promise<ActionResult<{ id: string; webhookSecretPlain: string }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = ConnectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  if (!parsed.data.password) {
    return { success: false, error: "Senha obrigatória ao criar conexão." };
  }

  // Fase 2: toda conexão nova nasce com webhook (token + secret cifrado).
  // O secret em plain só vive nesta variável e é retornado UMA VEZ pra UI.
  const credentials = generateWebhookCredentials();

  const conn = await prisma.nexusChatConnection.create({
    data: {
      name: parsed.data.name,
      host: parsed.data.host,
      port: parsed.data.port,
      database: parsed.data.database,
      username: parsed.data.username,
      passwordEnc: encrypt(parsed.data.password),
      sslMode: parsed.data.sslMode,
      applicationName: parsed.data.applicationName,
      status: "active",
      createdById: auth.userId,
      webhookToken: credentials.token,
      webhookSecretEnc: credentials.secretEnc,
    },
  });

  await logAudit({
    userId: auth.userId,
    action: "nexus_chat_connection_created",
    targetType: "nexus_chat_connection",
    targetId: conn.id,
    details: {
      name: parsed.data.name,
      host: parsed.data.host,
      port: parsed.data.port,
      database: parsed.data.database,
      username: parsed.data.username,
      sslMode: parsed.data.sslMode,
      applicationName: parsed.data.applicationName,
      webhookGenerated: true,
    },
  });

  return {
    success: true,
    data: { id: conn.id, webhookSecretPlain: credentials.secretPlain },
  };
}

export async function regenerateConnectionWebhookSecret(
  id: string,
): Promise<ActionResult<{ webhookSecretPlain: string }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const before = await prisma.nexusChatConnection.findUnique({
    where: { id, deletedAt: null },
  });
  if (!before) {
    return { success: false, error: "Conexão não encontrada." };
  }

  const credentials = generateWebhookCredentials();

  await prisma.nexusChatConnection.update({
    where: { id },
    data: { webhookSecretEnc: credentials.secretEnc },
  });

  await logAudit({
    userId: auth.userId,
    action: "webhook_secret_regenerated",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: { name: before.name },
  });

  return {
    success: true,
    data: { webhookSecretPlain: credentials.secretPlain },
  };
}

export async function updateNexusChatConnection(
  id: string,
  input: NexusChatConnectionInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const parsed = ConnectionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.message };
  }

  const before = await prisma.nexusChatConnection.findUnique({
    where: { id, deletedAt: null },
  });
  if (!before) {
    return { success: false, error: "Conexão não encontrada." };
  }

  // Senha vazia = manter atual (sem overwrite).
  const data: Record<string, unknown> = {
    name: parsed.data.name,
    host: parsed.data.host,
    port: parsed.data.port,
    database: parsed.data.database,
    username: parsed.data.username,
    sslMode: parsed.data.sslMode,
    applicationName: parsed.data.applicationName,
  };
  const passwordChanged = Boolean(parsed.data.password);
  if (passwordChanged) {
    data.passwordEnc = encrypt(parsed.data.password);
  }

  await prisma.nexusChatConnection.update({
    where: { id },
    data,
  });

  // Invalida pool local + sinaliza outros processos para fazer o mesmo.
  await invalidateNexusChatPool(id);
  await publishRealtimeEvent({ type: "connection:updated", connectionId: id });

  await logAudit({
    userId: auth.userId,
    action: "nexus_chat_connection_updated",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: {
      before: {
        name: before.name,
        host: before.host,
        port: before.port,
        database: before.database,
        username: before.username,
        sslMode: before.sslMode,
      },
      after: {
        name: parsed.data.name,
        host: parsed.data.host,
        port: parsed.data.port,
        database: parsed.data.database,
        username: parsed.data.username,
        sslMode: parsed.data.sslMode,
      },
      passwordChanged,
    },
  });

  return { success: true, data: { id } };
}

export async function softDeleteNexusChatConnection(
  id: string,
): Promise<ActionResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  // Bloqueia se há binding enabled. onDelete: Restrict no Prisma cobre
  // delete físico, não soft delete — daí a validação explícita.
  const enabledCount = await prisma.companyChatBinding.count({
    where: { connectionId: id, enabled: true, deletedAt: null },
  });
  if (enabledCount > 0) {
    return {
      success: false,
      error: `Existem ${enabledCount} empresas vinculadas a esta conexão. Desabilite os bindings primeiro.`,
    };
  }

  const conn = await prisma.nexusChatConnection.findUnique({ where: { id } });
  if (!conn) return { success: false, error: "Conexão não encontrada." };

  await prisma.nexusChatConnection.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await invalidateNexusChatPool(id);
  await publishRealtimeEvent({ type: "connection:deleted", connectionId: id });

  await logAudit({
    userId: auth.userId,
    action: "nexus_chat_connection_deleted",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: { name: conn.name, bindingsAffected: 0 },
  });

  return { success: true };
}

export async function testNexusChatConnection(
  id: string,
): Promise<ActionResult<{ durationMs: number }>> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const startedAt = Date.now();
  let success = false;
  let errorMessage: string | null = null;

  try {
    await queryNexusChat(id, "SELECT 1", []);
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startedAt;

  await prisma.nexusChatConnection.update({
    where: { id },
    data: {
      lastTestAt: new Date(),
      lastTestError: errorMessage,
    },
  });

  await logAudit({
    userId: auth.userId,
    action: "nexus_chat_connection_tested",
    targetType: "nexus_chat_connection",
    targetId: id,
    details: { success, durationMs, errorMessage: errorMessage ?? undefined },
  });

  if (success) return { success: true, data: { durationMs } };
  return { success: false, error: errorMessage ?? "Erro desconhecido." };
}
