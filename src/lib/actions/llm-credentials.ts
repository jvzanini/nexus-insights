"use server";

/**
 * Server Actions para gerenciamento de credenciais (API keys) do Agente Nex.
 *
 * Apenas super_admin pode listar/criar/editar/deletar/testar. As chaves são
 * cifradas com AES-256 dentro da lib `@/lib/llm/credentials` antes de
 * persistir em `llm_credentials`. Todo evento gera audit log.
 */

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import {
  CREDENTIAL_IN_USE,
  createCredential,
  deleteCredential,
  getCredentialApiKey,
  listCredentials,
  updateCredential,
  type CredentialSummary,
} from "@/lib/llm/credentials";
import {
  deepTest,
  describeErrorKind,
  type ErrorKind,
} from "@/lib/llm/providers/test-connection";
import type { LlmProvider } from "@/lib/llm/types";

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * Envelope de proteção (v0.12.1): toda exceção inesperada vira
 * `{ ok:false, error }` em vez de propagar pro client. Server Actions que
 * lançam derrubam a sessão Next ("This page couldn't load"); manter o
 * envelope estável é regra suprema.
 */
async function safeAction<T>(
  fn: () => Promise<ActionResult<T>>,
  context: string,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[llm-credentials:${context}] erro inesperado:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Erro inesperado: ${msg.slice(0, 200)}`,
    };
  }
}

interface SessionUserShape {
  id?: string;
  platformRole?: string;
}

async function requireSuperAdmin(): Promise<
  { ok: true; userId: string | null } | { ok: false; error: string }
> {
  const session = await auth();
  const user = (session?.user ?? {}) as SessionUserShape;
  if (user.platformRole !== "super_admin") {
    return {
      ok: false,
      error: "Apenas super_admin pode gerenciar credenciais de IA",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

export async function listLlmCredentialsAction(
  provider?: LlmProvider,
): Promise<ActionResult<CredentialSummary[]>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      const data = await listCredentials(provider);
      return { ok: true, data };
    } catch (err) {
      console.error("[llm-credentials] list:", err);
      return { ok: false, error: "Erro ao listar credenciais" };
    }
  }, "list");
}

export async function createLlmCredentialAction(input: {
  provider: LlmProvider;
  label?: string;
  apiKey: string;
}): Promise<ActionResult<{ id: string; label: string; last4: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      const created = await createCredential(input, guard.userId);
      await logAudit({
        userId: guard.userId,
        action: "credential_created",
        targetType: "llm_credential",
        targetId: created.id,
        details: { provider: input.provider, label: created.label },
      });
      return { ok: true, data: created };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Erro ao criar credencial",
      };
    }
  }, "create");
}

export async function updateLlmCredentialAction(
  id: string,
  input: { label?: string; apiKey?: string },
): Promise<ActionResult<{ label: string; last4: string }>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      const out = await updateCredential(id, input);
      await logAudit({
        userId: guard.userId,
        action: "credential_updated",
        targetType: "llm_credential",
        targetId: id,
        details: {
          provider: out.provider,
          label: out.label,
          rotated: input.apiKey !== undefined,
        },
      });
      return { ok: true, data: { label: out.label, last4: out.last4 } };
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "Erro ao atualizar credencial",
      };
    }
  }, "update");
}

export async function deleteLlmCredentialAction(
  id: string,
): Promise<ActionResult> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };
    try {
      await deleteCredential(id);
      await logAudit({
        userId: guard.userId,
        action: "credential_deleted",
        targetType: "llm_credential",
        targetId: id,
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof Error && err.message === CREDENTIAL_IN_USE) {
        return {
          ok: false,
          error:
            "Esta chave está em uso pelo Agente Nex. Selecione outra antes de deletar.",
        };
      }
      return {
        ok: false,
        error:
          err instanceof Error ? err.message : "Erro ao deletar credencial",
      };
    }
  }, "delete");
}

export interface TestLlmConnectionResult {
  reachable: boolean;
  message?: string;
  creditOk?: boolean;
  creditRemainingUsd?: number;
  errorKind?: ErrorKind;
}

export async function testLlmCredentialAction(
  credentialId: string,
  provider: LlmProvider,
  model: string,
): Promise<ActionResult<TestLlmConnectionResult>> {
  return safeAction(async () => {
    const guard = await requireSuperAdmin();
    if (!guard.ok) return { ok: false, error: guard.error };

    const apiKey = await getCredentialApiKey(credentialId);
    if (!apiKey) {
      return { ok: false, error: "Credencial não encontrada ou ilegível" };
    }

    const result = await deepTest(provider, apiKey, model);
    const friendly =
      result.errorKind && result.errorKind !== "other"
        ? describeErrorKind(result.errorKind, result.message, model)
        : result.message;

    await logAudit({
      userId: guard.userId,
      action: "credential_tested",
      targetType: "llm_credential",
      targetId: credentialId,
      details: { provider, model, reachable: result.reachable },
    });

    return {
      ok: true,
      data: {
        reachable: result.reachable,
        message: friendly?.slice(0, 240),
        errorKind: result.errorKind,
        creditOk: result.creditOk,
        creditRemainingUsd: result.creditRemainingUsd,
      },
    };
  }, "test");
}
