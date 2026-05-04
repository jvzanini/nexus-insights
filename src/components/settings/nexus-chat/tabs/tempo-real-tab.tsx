"use client";

import { Radio } from "lucide-react";

/**
 * Aba 2 — Tempo real (placeholder Fase 3 v1).
 *
 * Estrutura final (spec §8): 4 KPI cards (eventos/h, latência média, erros
 * HMAC, última heartbeat) + line chart eventos/min últimas 24h + stream
 * virtualizado de eventos webhook.
 *
 * Esta versão entrega placeholder informativo enquanto subagent dedicado
 * implementa em hotfix subsequente. Já reserva o slot da aba e código
 * splitting (dynamic) está montado.
 */
export function TempoRealTab(_props: { connectionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <Radio className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <h3 className="text-sm font-medium">Tempo real em construção</h3>
      <p className="max-w-md text-xs text-muted-foreground">
        Stream de eventos webhook + KPIs + gráfico de 24h serão entregues no
        próximo hotfix da Fase 3. Por enquanto, consulte os audit logs em{" "}
        <code className="font-mono">/usuarios?tab=auditoria</code> filtrando
        por <code className="font-mono">webhook_*</code>.
      </p>
    </div>
  );
}
