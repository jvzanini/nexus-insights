import type { TourConfig } from "@/components/tour/tour-provider";

export const dashboardTour: TourConfig = {
  id: "dashboard",
  title: "Tour do Dashboard",
  steps: [
    {
      id: "filters",
      targetSelector: "[data-tour='dashboard-filters']",
      title: "Filtros de empresa e período",
      description:
        "Escolha a empresa (conta Chatwoot) e o período (Hoje, 7 ou 30 dias). Os dados se atualizam automaticamente.",
      placement: "bottom",
    },
    {
      id: "refresh",
      targetSelector: "[data-tour='dashboard-refresh']",
      title: "Atualizar agora",
      description:
        "O dashboard se atualiza sozinho a cada 60 segundos, mas você pode forçar uma atualização aqui.",
      placement: "left",
    },
    {
      id: "kpis",
      targetSelector: "[data-tour='dashboard-kpis']",
      title: "Indicadores principais",
      description:
        "Cards clicáveis mostram volume recebido, resolvidas, em aberto agora e taxa de resolução. Clique para ver o detalhe.",
      placement: "bottom",
    },
    {
      id: "chart",
      targetSelector: "[data-tour='dashboard-chart']",
      title: "Linha do tempo",
      description:
        "Gráfico com o volume de conversas recebidas e resolvidas ao longo do período selecionado.",
      placement: "top",
    },
    {
      id: "tops",
      targetSelector: "[data-tour='dashboard-tops']",
      title: "Rankings",
      description:
        "Listas com atendentes mais rápidos, inboxes em aberto e departamentos com mais resolvidas no período.",
      placement: "top",
    },
    {
      id: "recent",
      targetSelector: "[data-tour='dashboard-recent']",
      title: "Conversas recentes",
      description:
        "Últimas conversas com link direto para abrir no Chatwoot.",
      placement: "top",
    },
  ],
};
