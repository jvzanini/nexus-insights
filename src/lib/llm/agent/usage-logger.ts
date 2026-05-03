import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { ensureLlmTables } from "../ensure-tables";
import { getUsdBrlRate } from "../exchange-rate";

/**
 * Registra uma chamada do Agente Nex em `llm_usage`.
 *
 * Falhas são engolidas silenciosamente (não devem bloquear o chat). Se a tabela
 * ainda não existe, `ensureLlmTables` a cria sob demanda. A cotação USD→BRL é
 * obtida via `getUsdBrlRate` (cache 4h); se falhar, `cost_brl` e
 * `usd_to_brl_rate` são gravados como NULL e o INSERT segue normalmente.
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
  isPlayground?: boolean; // v0.31.0
}): Promise<void> {
  try {
    await ensureLlmTables();

    let costBrl: number | null = null;
    let usdToBrlRate: number | null = null;
    try {
      const r = await getUsdBrlRate();
      usdToBrlRate = +r.rate.toFixed(4);
      costBrl = +(args.costUsd * r.rate).toFixed(6);
    } catch (err) {
      console.warn("[nex] Falha ao obter cotação USD/BRL:", err);
    }

    await pgPool.query(
      `INSERT INTO llm_usage (
         id, provider, model, tokens_input, tokens_output, cost_usd, cost_brl,
         usd_to_brl_rate, prompt_chars, response_chars, user_id, duration_ms,
         error_message, is_playground, created_at
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        args.provider,
        args.model,
        args.tokensInput,
        args.tokensOutput,
        args.costUsd,
        costBrl,
        usdToBrlRate,
        args.promptChars,
        args.responseChars,
        args.userId ?? null,
        args.durationMs ?? null,
        args.errorMessage ?? null,
        args.isPlayground ?? false,
      ],
    );
  } catch (err) {
    console.warn("[nex] Falha ao registrar uso em llm_usage:", err);
  }
}
