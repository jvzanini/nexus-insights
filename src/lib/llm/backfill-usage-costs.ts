import "server-only";

import { pgPool } from "@/lib/pg-pool";

import { getUsdBrlRate } from "./exchange-rate";
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
 * Em v0.13.1 também passou a popular `cost_brl` e `usd_to_brl_rate` em rows
 * com BRL=NULL, usando a cotação atual (cartão). Como perdemos a cotação
 * histórica de cada chamada antiga, é uma aproximação — mas é melhor que
 * mostrar "—" no relatório. Idempotente: WHERE cost_brl IS NULL.
 */
export async function backfillUsageCosts(): Promise<{
  updatedUsdRows: number;
  updatedBrlRows: number;
  modelsTouched: string[];
}> {
  const updatedPerModel: string[] = [];
  let totalUsdUpdated = 0;

  // Etapa 1: cost_usd a partir de tokens × MODEL_PRICING.
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
      totalUsdUpdated += result.rowCount;
    }
  }

  if (totalUsdUpdated > 0) {
    console.log(
      `[backfill-usage-costs] cost_usd recalculado em ${totalUsdUpdated} rows: ${updatedPerModel.join(", ")}`,
    );
  }

  // Etapa 2: cost_brl a partir da cotação atual em rows com cost_brl IS NULL.
  // Aproximação: aplica a taxa do dia do backfill (perdemos a cotação histórica
  // de cada chamada). Idempotente — só toca rows BRL=NULL.
  let totalBrlUpdated = 0;
  try {
    const rate = await getUsdBrlRate();
    const brlResult = await pgPool.query(
      `UPDATE llm_usage
          SET cost_brl = ROUND((cost_usd * $1::numeric)::numeric, 6),
              usd_to_brl_rate = $1::numeric
        WHERE cost_brl IS NULL
          AND cost_usd > 0`,
      [rate.rate],
    );
    totalBrlUpdated = brlResult.rowCount ?? 0;
    if (totalBrlUpdated > 0) {
      console.log(
        `[backfill-usage-costs] cost_brl populado em ${totalBrlUpdated} rows com taxa ${rate.rate.toFixed(4)} (${rate.source}).`,
      );
    }
  } catch (err) {
    console.warn(
      "[backfill-usage-costs] backfill BRL falhou (cotação indisponível):",
      err,
    );
  }

  return {
    updatedUsdRows: totalUsdUpdated,
    updatedBrlRows: totalBrlUpdated,
    modelsTouched: updatedPerModel,
  };
}
