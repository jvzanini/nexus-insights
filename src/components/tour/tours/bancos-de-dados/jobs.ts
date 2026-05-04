import type { TourConfig } from "../../tour-provider";

/**
 * Tour da Aba 3 — Jobs (pré-agregação). 3 steps:
 *  1. Intro — o que são os jobs e por que existem.
 *  2. Tabela de status — uma linha por (account × dimensão).
 *  3. Badges Fresco / Atrasado / Travado.
 *
 * Targets via `[data-tour='jobs-*']` em `tabs/jobs-tab.tsx` + JobsPanel.
 */
export const jobsTour: TourConfig = {
  id: "bancos-de-dados-jobs",
  title: "Aba Jobs",
  steps: [
    {
      id: "intro",
      targetSelector: "[data-tour='jobs-tab']",
      title: "Jobs de pré-agregação",
      description:
        "Worker que popula as tabelas internas chatwoot_facts_* (atendimentos, espera, departamentos, etc). Os relatórios leem dessas tabelas — não diretamente do Nexus Chat.",
      placement: "bottom",
    },
    {
      id: "explainer",
      targetSelector: "[data-tour='jobs-tab-explainer']",
      title: "Roda automaticamente",
      description:
        "Cron a cada 30 minutos refresca a janela móvel de 7 dias. Você só precisa intervir se algum job ficar travado por horas — use os botões Refresh manual ou Backfill.",
      placement: "bottom",
    },
    {
      id: "badges",
      targetSelector: "[data-tour='jobs-tab']",
      title: "Badges Fresco / Atrasado / Travado",
      description:
        "Fresco = atualizado no último ciclo; Atrasado = mais de 60 minutos sem refresh; Travado = job em erro persistente. Clique no badge para ver o último log.",
      placement: "top",
    },
  ],
};
