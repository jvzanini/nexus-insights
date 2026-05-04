"use client";

import { Settings2 } from "lucide-react";
import Link from "next/link";

/**
 * Aba 3 — Jobs (placeholder Fase 3 v1).
 *
 * Estrutura final (spec §9): reutiliza `<JobsPanel>` com prop
 * `connectionId` filtrando os 4 jobs (refresh-by-account/inbox/agent/team)
 * dessa connection + housekeeping. Disparo manual + backfill mantidos.
 *
 * Esta versão linka pra page legada `/configuracoes/jobs` enquanto
 * adaptação do `<JobsPanel>` (recebendo connectionId) é entregue em
 * hotfix subsequente.
 */
export function JobsTab({ connectionId: _connectionId }: { connectionId: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center">
      <Settings2 className="h-8 w-8 text-muted-foreground/50" aria-hidden />
      <h3 className="text-sm font-medium">Painel de jobs</h3>
      <p className="max-w-md text-xs text-muted-foreground">
        Status dos jobs de pré-agregação, disparo manual e backfill ficam
        temporariamente em página dedicada enquanto a integração nesta aba
        é finalizada.
      </p>
      <Link
        href="/configuracoes/jobs"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
      >
        Abrir painel de jobs
      </Link>
    </div>
  );
}
