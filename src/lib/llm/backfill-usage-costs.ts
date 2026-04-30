import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { MODEL_PRICING } from "./pricing";

/**
 * Backfill one-shot de `llm_usage.cost_usd` para chamadas antigas que ficaram
 * com cost=0. Antes do v0.12.1, modelos como `gpt-4.1-mini`, `gpt-5.x`,
 * `claude-4.7` etc. NÃO estavam no `MODEL_PRICING` — `calculateCost` retornava
 * 0, e zero foi gravado no banco. Resultado: a tela "Consumo do Agente Nex"
 * mostrava `$0,000` em todas as chamadas.
 *
 * Esta função recalcula `cost_usd` em rows com `cost_usd = 0` cujos modelos
 * agora têm pricing conhecido. **Idempotente**: a query `WHERE cost_usd = 0`
 * filtra automaticamente rows já corrigidas.
 *
 * NÃO recalcula `cost_brl` / `usd_to_brl_rate` — estes dependem da cotação no
 * momento da chamada, que perdemos. Rows antigas continuam com BRL=NULL e a UI
 * mostra "—" (esperado).
 */
export async function backfillUsageCosts(): Promise<{
  updatedRows: number;
  modelsTouched: string[];
}> {
  const updatedPerModel: string[] = [];
  let totalUpdated = 0;

  for (const [modelId, pricing] of Object.entries(MODEL_PRICING)) {
    const result = await pgPool.query(
      `UPDATE llm_usage
          SET cost_usd = ROUND(((tokens_input * $1::numeric + tokens_output * $2::numeric) / 1000000)::numeric, 6)
        WHERE cost_usd = 0
          AND model = $3
          AND (tokens_input > 0 OR tokens_output > 0)`,
      [pricing.inputPerMillion, pricing.outputPerMillion, modelId],
    );
    if (result.rowCount && result.rowCount > 0) {
      updatedPerModel.push(`${modelId} (${result.rowCount} rows)`);
      totalUpdated += result.rowCount;
    }
  }

  if (totalUpdated > 0) {
    console.log(
      `[backfill-usage-costs] cost_usd recalculado em ${totalUpdated} rows: ${updatedPerModel.join(", ")}`,
    );
  }

  return { updatedRows: totalUpdated, modelsTouched: updatedPerModel };
}
