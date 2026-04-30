import type { TourConfig } from "@/components/tour/tour-provider";

export const origemIaTour: TourConfig = {
  id: "origem-ia",
  title: "Tour do relatório de Origem & IA",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='origem-period']",
      title: "Período",
      description:
        "Defina o intervalo da análise: pills rápidas (Hoje, 7 ou 30 dias) ou Personalizado para escolher um período específico.",
      placement: "bottom",
    },
    {
      id: "tabs",
      targetSelector: "[data-tour='origem-tabs']",
      title: "Abas do relatório",
      description:
        "Alterne entre Leads recebidos (volume de novas conversas) e Matrix IA (canal automatizado), quando disponível.",
      placement: "bottom",
    },
    {
      id: "leads",
      targetSelector: "[data-tour='origem-tab-leads']",
      title: "Leads recebidos",
      description:
        "KPIs com total e média de leads no período + gráfico de área mostrando a evolução. Use o seletor de granularidade para alternar entre dia, semana e mês.",
      placement: "top",
    },
    {
      id: "matrix",
      targetSelector: "[data-tour='origem-tab-matrix']",
      title: "Matrix IA",
      description:
        "Métricas do canal automatizado: conversas atendidas pela IA, tempos de resposta e desempenho geral. Esta aba só aparece se o canal estiver habilitado para você.",
      placement: "top",
    },
    {
      id: "refresh",
      targetSelector: "[data-tour='refresh']",
      title: "Atualizar dados",
      description:
        "Os dados são cacheados por alguns minutos. Use Atualizar para forçar a busca dos dados mais recentes do Chatwoot.",
      placement: "left",
    },
  ],
};
