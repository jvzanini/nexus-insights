"use client";

import { HeartPulse } from "lucide-react";

/**
 * Aba 4 — Saúde (placeholder Fase 3 v1).
 *
 * Estrutura final (spec §10): 4 cards (heartbeat, eventos 24h, erros 24h,
 * jobs com erro) com cores semânticas + lista de audit logs últimas 50.
 *
 * Esta versão entrega placeholder informativo enquanto subagent dedicado
 * implementa em hotfix subsequente — health-metrics Server Action + cards
 * exigem suite de testes apropriada.
 */
export function SaudeTab(_props: { connectionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <HeartPulse className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <h3 className="text-sm font-medium">Saúde da conexão em construção</h3>
      <p className="max-w-md text-xs text-muted-foreground">
        Heartbeat (último webhook), eventos 24h, erros 24h, jobs com erro e
        lista de audit logs serão entregues no próximo hotfix da Fase 3.
        Consulte agora{" "}
        <code className="font-mono">/api/health</code> via curl para
        diagnóstico básico.
      </p>
    </div>
  );
}
