import type { TourConfig } from "@/components/tour/tour-provider";

export const performanceTour: TourConfig = {
  id: "performance",
  title: "Tour do relatório de Performance",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='perf-period']",
      title: "Período",
      description:
        "Defina o intervalo da análise: pills rápidas (Hoje, 7 ou 30 dias) ou Personalizado para escolher um período específico.",
      placement: "bottom",
    },
    {
      id: "tabs",
      targetSelector: "[data-tour='perf-tabs']",
      title: "Abas do relatório",
      description:
        "Alterne entre Tempos de resposta (1ª resposta e resolução), SLA (cumprimento de prazo) e CSAT (satisfação do cliente).",
      placement: "bottom",
    },
    {
      id: "tempos",
      targetSelector: "[data-tour='perf-tab-tempos']",
      title: "Tempos de resposta",
      description:
        "KPIs de tempo médio até a 1ª resposta e tempo até a resolução, com comparativo por departamento. Cores indicam quão longe estão da meta.",
      placement: "top",
    },
    {
      id: "sla-csat",
      targetSelector: "[data-tour='perf-tab-sla-csat']",
      title: "SLA e CSAT",
      description:
        "SLA mostra cumprimento dos prazos contratados. CSAT mostra a nota média de satisfação e a distribuição das avaliações dos clientes.",
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
