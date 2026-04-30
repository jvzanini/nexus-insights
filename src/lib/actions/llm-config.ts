"use server";

/**
 * Server Actions para configuração do LLM provider ativo.
 *
 * Apenas super_admin pode salvar/testar. API keys são cifradas com AES-256
 * via `@/lib/encryption` antes de persistir em `llm_configs`.
 */

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { encrypt } from "@/lib/encryption";
import { ensureLlmTables } from "@/lib/llm/ensure-tables";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";
import { invalidateNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import {
  deepTest,
  describeErrorKind,
  type ErrorKind,
} from "@/lib/llm/providers/test-connection";
import type { LlmProvider } from "@/lib/llm/types";
import { pgPool } from "@/lib/pg-pool";

export interface SaveLlmConfigInput {
  provider: LlmProvider;
  model: string;
  apiKey: string;
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

const VALID_PROVIDERS: LlmProvider[] = [
  "openai",
  "anthropic",
  "gemini",
  "openrouter",
];

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
      error: "Apenas super_admin pode editar configurações de IA",
    };
  }
  return { ok: true, userId: user.id ?? null };
}

function validateInput(input: SaveLlmConfigInput): string | null {
  if (!VALID_PROVIDERS.includes(input.provider)) {
    return "Provider inválido";
  }
  const model = input.model?.trim() ?? "";
  // A partir do v0.7.0 aceitamos modelo livre (PROVIDER_CATALOG.allowCustomModel
  // === true para todos). Validação apenas estrutural: 3 a 100 chars.
  if (model.length < 3 || model.length > 100) {
    return "Modelo inválido (3 a 100 caracteres)";
  }
  if (!input.apiKey || typeof input.apiKey !== "string") {
    return "API key é obrigatória";
  }
  const trimmed = input.apiKey.trim();
  if (trimmed.length < 10) {
    return "API key inválida (muito curta)";
  }
  return null;
}

export async function saveLlmConfig(
  input: SaveLlmConfigInput,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  await ensureLlmTables();

  const trimmedModel = input.model.trim();
  const encryptedKey = encrypt(input.apiKey.trim());

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE llm_configs SET is_active = false WHERE is_active = true`,
    );
    await client.query(
      `INSERT INTO llm_configs (id, provider, model, encrypted_api_key, is_active, created_at, updated_at, created_by_id)
       VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW(), $4)`,
      [input.provider, trimmedModel, encryptedKey, guard.userId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("[llm-config] Falha ao salvar configuração:", err);
    return { ok: false, error: "Erro ao salvar configuração no banco" };
  } finally {
    client.release();
  }

  await logAudit({
    userId: guard.userId,
    action: "setting_updated",
    targetType: "llm_config",
    details: { provider: input.provider, model: trimmedModel },
  });

  return { ok: true };
}

export interface TestLlmConnectionResult {
  reachable: boolean;
  message?: string;
  /** Saldo verificado: true = OK; false = sem crédito; undefined = não verificável. */
  creditOk?: boolean;
  /** USD restantes (best-effort, atualmente só OpenRouter). */
  creditRemainingUsd?: number;
  errorKind?: ErrorKind;
  tokensInput?: number;
  tokensOutput?: number;
}

/**
 * Teste profundo de conexão com o provider. Diferencia chave inválida, modelo
 * inexistente, falta de crédito, rate limit, erro de rede e outros. Quando
 * possível, valida saldo (atualmente OpenRouter expõe `total_credits`).
 */
export async function testLlmConnection(
  input: SaveLlmConfigInput,
): Promise<ActionResult<TestLlmConnectionResult>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const trimmedModel = input.model.trim();
  const trimmedKey = input.apiKey.trim();

  const result = await deepTest(input.provider, trimmedKey, trimmedModel);

  // Mensagem amigável a partir do errorKind (ou mantém a original do provider).
  const friendly =
    result.errorKind && result.errorKind !== "other"
      ? describeErrorKind(result.errorKind, result.message, trimmedModel)
      : result.message;

  return {
    ok: true,
    data: {
      reachable: result.reachable,
      message: friendly?.slice(0, 240),
      errorKind: result.errorKind,
      creditOk: result.creditOk,
      creditRemainingUsd: result.creditRemainingUsd,
      tokensInput: result.tokensInput,
      tokensOutput: result.tokensOutput,
    },
  };
}

export async function getActiveLlmConfigSummary(): Promise<
  ActionResult<{
    provider: LlmProvider;
    model: string;
    apiKeyMasked: string;
  } | null>
> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const summary = await getPublicActiveLlmConfig();
  return { ok: true, data: summary };
}

/**
 * Liga/desliga globalmente a bolha flutuante do Agente Nex. Persistido em
 * `app_settings` sob a chave `nex.bubble_enabled`. Apenas super_admin.
 */
export async function setNexBubbleEnabled(
  enabled: boolean,
): Promise<ActionResult> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  try {
    await pgPool.query(
      `INSERT INTO app_settings (key, value, category, updated_at)
       VALUES ('nex.bubble_enabled', $1::jsonb, 'platform', NOW())
       ON CONFLICT (key) DO UPDATE
         SET value = $1::jsonb, updated_at = NOW()`,
      [JSON.stringify(enabled)],
    );
  } catch (err) {
    console.error("[setNexBubbleEnabled] Falha ao persistir setting:", err);
    return { ok: false, error: "Erro ao salvar configuração" };
  }

  invalidateNexBubbleEnabled();
  revalidatePath("/", "layout");

  await logAudit({
    userId: guard.userId,
    action: "setting_updated",
    targetType: "platform_settings",
    targetId: "nex_bubble_enabled",
    details: { enabled },
  });

  return { ok: true };
}
