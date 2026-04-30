import type { TourConfig } from "@/components/tour/tour-provider";

export const distribuicaoTour: TourConfig = {
  id: "distribuicao",
  title: "Tour do relatório de Distribuição",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='dist-period']",
      title: "Período",
      description:
        "Defina o intervalo da análise: pills rápidas (Hoje, 7 ou 30 dias) ou Personalizado para escolher um período específico.",
      placement: "bottom",
    },
    {
      id: "tabs",
      targetSelector: "[data-tour='dist-tabs']",
      title: "Abas do relatório",
      description:
        "Alterne entre a distribuição por estado (caixa de entrada do Chatwoot) e o heatmap por horário (dia da semana × hora).",
      placement: "bottom",
    },
    {
      id: "estado",
      targetSelector: "[data-tour='dist-tab-estado']",
      title: "Por estado",
      description:
        "Veja em qual caixa de entrada (loja/unidade) está concentrado o volume de conversas. Útil para identificar gargalos por canal.",
      placement: "top",
    },
    {
      id: "horario",
      targetSelector: "[data-tour='dist-tab-horario']",
      title: "Heatmap horário",
      description:
        "Mapa de calor mostra o volume por dia da semana e hora — descubra os horários de pico e planeje a escala da equipe.",
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
