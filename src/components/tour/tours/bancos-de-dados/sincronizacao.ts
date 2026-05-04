import type { TourConfig } from "../../tour-provider";

/**
 * Tour da Aba 2 — Sincronização (polling delta universal). 4 steps:
 *  1. Intro — explica polling delta + diferença vs UI 5s.
 *  2. KPIs — 4 cards (última sync / runs 1h est. / erros 24h / linhas 1h est.).
 *  3. Pause/Play — controla apenas a atualização da tela (não o worker).
 *  4. Lista de runs — audit logs `polling_*` recentes.
 *
 * Targets via `[data-tour='sincronizacao-*']` em `tabs/sincronizacao-tab.tsx`.
 */
export const sincronizacaoTour: TourConfig = {
  id: "bancos-de-dados-sincronizacao",
  title: "Aba Sincronização",
  steps: [
    {
      id: "header",
      targetSelector: "[data-tour='sincronizacao-header']",
      title: "Polling delta universal",
      description:
        "Substitui o webhook (v0.40 fim). O worker consulta o banco do Nexus Chat a cada N segundos e detecta mudanças incrementalmente. Default 30s, mínimo 20s — configurável na Aba Conexão.",
      placement: "bottom",
    },
    {
      id: "kpis",
      targetSelector: "[data-tour='sincronizacao-kpis']",
      title: "4 KPIs polling-aware",
      description:
        "Última sync (lag colorido — verde até 60s, âmbar até 5min, vermelho acima); runs 1h e linhas 1h são estimativas (runs OK são amostrados 1/100, falhas 100%); erros 24h é exato.",
      placement: "bottom",
    },
    {
      id: "pause",
      targetSelector: "[data-tour='sincronizacao-header']",
      title: "Pausa controla só a tela",
      description:
        "O botão Pausar/Retomar no canto direito interrompe apenas a atualização desta página (5s). O worker em si continua rodando no intervalo configurado.",
      placement: "left",
    },
    {
      id: "runs",
      targetSelector: "[data-tour='sincronizacao-runs']",
      title: "Lista de runs recentes",
      description:
        "Até 200 audit logs ordenados do mais recente ao mais antigo. Mostra a ação (Sync OK / Sync falhou / Sweep / Intervalo alterado), duração e quantidade de linhas processadas.",
      placement: "top",
    },
  ],
};
