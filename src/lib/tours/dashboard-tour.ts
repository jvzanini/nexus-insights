import type { TourConfig } from "@/components/tour/tour-provider";

export const dashboardTour: TourConfig = {
  id: "dashboard",
  title: "Tour do Dashboard",
  steps: [
    {
      id: "filters",
      targetSelector: "[data-tour='dashboard-filters']",
      title: "Filtro de período",
      description:
        "Escolha o período (Hoje, 7 ou 30 dias). A conta atual é definida no menu lateral e vale para toda a plataforma.",
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
        "Recebidas, resolvidas, abertas e taxa de resolução — todas no mesmo recorte de criação no período. Clique em cada card para o detalhe.",
      placement: "bottom",
    },
    {
      id: "no-response",
      targetSelector: "[data-tour='dashboard-no-response'], [data-tour='dashboard-kpis']",
      title: "Sem resposta agora",
      description:
        "Conversas que estão aguardando resposta — apenas com status 'Aberto' e a última mensagem do contato. Clique em 'Ver todas' para o detalhe.",
      placement: "top",
    },
    {
      id: "chart",
      targetSelector: "[data-tour='dashboard-chart']",
      title: "Linha do tempo",
      description:
        "Volume de conversas recebidas e resolvidas ao longo do período. Alterne entre linha e barras pelo botão no canto.",
      placement: "top",
    },
    {
      id: "distributions",
      targetSelector: "[data-tour='dashboard-distributions']",
      title: "Inboxes e departamentos",
      description:
        "Distribuição das conversas em aberto por inbox e por departamento (incluindo bucket 'Sem departamento'). Clique em qualquer barra ou fatia para ver as conversas.",
      placement: "top",
    },
    {
      id: "status",
      targetSelector: "[data-tour='dashboard-status']",
      title: "Distribuição por status",
      description:
        "Donut com aberto, pendente, adiado e resolvido — recortado pelas conversas criadas no período. Clique num status para abrir a lista.",
      placement: "top",
    },
  ],
};
