import type { TourConfig } from "@/components/tour/tour-provider";

export const equipeTour: TourConfig = {
  id: "equipe",
  title: "Tour do relatório de Equipe",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='equipe-period']",
      title: "Período",
      description:
        "Defina o intervalo da análise: pills rápidas (Hoje, 7 ou 30 dias) ou Personalizado para escolher um período específico.",
      placement: "bottom",
    },
    {
      id: "tabs",
      targetSelector: "[data-tour='equipe-tabs']",
      title: "Abas do relatório",
      description:
        "Alterne entre o ranking de atendentes individuais e a visão consolidada por departamento.",
      placement: "bottom",
    },
    {
      id: "ranking",
      targetSelector: "[data-tour='equipe-tab-ranking']",
      title: "Ranking de atendentes",
      description:
        "KPIs do time + gráfico com volume e tempos médios por atendente. A tabela detalha cada pessoa: conversas atendidas, 1ª resposta e tempo de resolução.",
      placement: "top",
    },
    {
      id: "departamento",
      targetSelector: "[data-tour='equipe-tab-departamento']",
      title: "Por departamento",
      description:
        "Compare departamentos lado a lado: volume de conversas resolvidas, tempos médios e quem está performando melhor.",
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
