import type { TourConfig } from "../../tour-provider";

/**
 * Tour da Aba 4 — Saúde. 3 steps:
 *  1. Intro — diferença entre Saúde e Sincronização.
 *  2. KPIs heartbeat — 4 cards snapshot (sem polling).
 *  3. Erros recentes — top 5 falhas pra triagem rápida.
 *
 * Targets via `[data-tour='saude-*']` em `tabs/saude-tab.tsx`.
 */
export const saudeTour: TourConfig = {
  id: "bancos-de-dados-saude",
  title: "Aba Saúde",
  steps: [
    {
      id: "header",
      targetSelector: "[data-tour='saude-header']",
      title: "Visão consolidada de saúde",
      description:
        "Diferente da Aba Sincronização (que polla a cada 5s e mostra runs ao vivo), esta aba é um snapshot único focado em ERROS. Use para triagem rápida quando algo parece quebrado.",
      placement: "bottom",
    },
    {
      id: "kpis",
      targetSelector: "[data-tour='saude-kpis']",
      title: "4 cards heartbeat",
      description:
        "Heartbeat (lag da última sync — verde <60min, âmbar até 6h, vermelho acima); Runs 24h estimadas; Erros 24h exatos; Jobs com erro 24h. Cores indicam severidade automaticamente.",
      placement: "bottom",
    },
    {
      id: "erros",
      targetSelector: "[data-tour='saude-erros']",
      title: "Top 5 erros recentes",
      description:
        "Lista os polling_sync_failed mais recentes com tabela afetada e mensagem do erro (truncada). Quando vazia, mostra um banner verde de confirmação. Para investigação profunda, use os audit logs abaixo.",
      placement: "top",
    },
  ],
};
