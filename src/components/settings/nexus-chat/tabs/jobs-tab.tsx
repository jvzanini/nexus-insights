"use client";

import { Settings2 } from "lucide-react";

import { JobsPanel } from "@/components/settings/jobs-panel";
import type { JobsStatusRow } from "@/lib/actions/jobs";

interface Props {
  connectionId: string;
  /**
   * Snapshot SSR de `getJobsStatus({ connectionId })` — passado por
   * `<ConnectionDetailTabs>` que recebe da page detalhe. Hidrata o
   * `<JobsPanel>` sem fetch initial no client. Polling 5s do JobsPanel
   * permanece ativo.
   */
  initialStatus: { rows: JobsStatusRow[] } | null;
}

/**
 * Aba 3 — Jobs (v0.41 SSR-first).
 *
 * Embute `<JobsPanel>` filtrado pela connectionId. O painel mostra o
 * status de freshness de cada (account × dimension) e oferece botões
 * para disparar refresh manual e backfill.
 *
 * SSR-first: a page detalhe chama `getJobsStatus({ connectionId })` no
 * server side e injeta o resultado em `initialStatus`. Isto evita o
 * flash de skeleton inicial.
 */
export function JobsTab({ connectionId, initialStatus }: Props) {
  return (
    <div className="grid gap-4" data-tour="jobs-tab">
      <header className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-violet-500" aria-hidden />
        <h2 className="text-sm font-medium">Jobs de pré-agregação</h2>
      </header>
      <p
        className="text-xs text-muted-foreground"
        data-tour="jobs-tab-explainer"
      >
        Os jobs de pré-agregação atualizam tabelas internas
        (chatwoot_facts_*) que alimentam os relatórios. Eles rodam
        automaticamente — você só precisa intervir se algum ficar com erro.
      </p>
      <JobsPanel
        initialStatus={initialStatus}
        connectionId={connectionId}
      />
    </div>
  );
}
