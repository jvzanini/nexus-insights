import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { ensureLlmTables } from "../ensure-tables";

/**
 * Registra uma chamada do Agente Nex em `llm_usage`.
 *
 * Falhas são engolidas silenciosamente (não devem bloquear o chat). Se a tabela
 * ainda não existe, `ensureLlmTables` a cria sob demanda.
 */
export async function logUsage(args: {
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  promptChars: number;
  responseChars: number;
  userId?: string;
  durationMs?: number;
  errorMessage?: string;
}): Promise<void> {
  try {
    await ensureLlmTables();
    await pgPool.query(
      `INSERT INTO llm_usage (
        id, provider, model, tokens_input, tokens_output, cost_usd,
        prompt_chars, response_chars, user_id, duration_ms, error_message, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [
        args.provider,
        args.model,
        args.tokensInput,
        args.tokensOutput,
        args.costUsd,
        args.promptChars,
        args.responseChars,
        args.userId ?? null,
        args.durationMs ?? null,
        args.errorMessage ?? null,
      ],
    );
  } catch (err) {
    console.warn("[nex] Falha ao registrar uso em llm_usage:", err);
  }
}
