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
import { buildLlmClient } from "@/lib/llm/get-client";
import { getPublicActiveLlmConfig } from "@/lib/llm/get-active-config";
import { invalidateNexBubbleEnabled } from "@/lib/llm/get-nex-bubble-enabled";
import { PROVIDER_MODELS } from "@/lib/llm/pricing";
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
  const allowedModels = PROVIDER_MODELS[input.provider] ?? [];
  if (!allowedModels.includes(input.model)) {
    return "Modelo inválido para o provider selecionado";
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
      [input.provider, input.model, encryptedKey, guard.userId],
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
    details: { provider: input.provider, model: input.model },
  });

  return { ok: true };
}

export interface TestLlmConnectionResult {
  reachable: boolean;
  message?: string;
  tokensInput?: number;
  tokensOutput?: number;
}

/**
 * Faz uma chamada simples ("ping") para verificar se a API key + modelo são
 * válidos. Não persiste nada. Retorna `reachable=false` quando o adapter
 * lança erro (4xx/5xx) ou quando a key é mock.
 */
export async function testLlmConnection(
  input: SaveLlmConfigInput,
): Promise<ActionResult<TestLlmConnectionResult>> {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const validationError = validateInput(input);
  if (validationError) return { ok: false, error: validationError };

  const client = buildLlmClient(input.provider, input.apiKey.trim(), input.model);

  try {
    const result = await client.chat({
      messages: [
        {
          role: "user",
          content: "Responda apenas com a palavra: ok",
        },
      ],
      maxTokens: 16,
      temperature: 0,
    });
    return {
      ok: true,
      data: {
        reachable: true,
        message: result.message.slice(0, 200),
        tokensInput: result.usage.tokensInput,
        tokensOutput: result.usage.tokensOutput,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return {
      ok: true,
      data: { reachable: false, message: msg },
    };
  }
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
