import type { TourConfig } from "@/components/tour/tour-provider";

export const mensagensNaoRespondidasTour: TourConfig = {
  id: "mensagens-nao-respondidas",
  title: "Tour de Mensagens não respondidas",
  steps: [
    {
      id: "kpis",
      targetSelector: "[data-tour='mnr-kpis']",
      title: "Indicadores de espera",
      description:
        "Veja o total aguardando, o tempo médio de espera e o caso mais antigo em aberto. Os tons (amarelo/vermelho) destacam casos críticos.",
      placement: "bottom",
    },
    {
      id: "filters",
      targetSelector: "[data-tour='mnr-filters']",
      title: "Filtros",
      description:
        "Filtre por estado (caixa de entrada), departamento e atendente para focar nos casos que importam para você.",
      placement: "bottom",
    },
    {
      id: "table",
      targetSelector: "[data-tour='mnr-table']",
      title: "Lista de mensagens não respondidas",
      description:
        "Conversas em aberto cuja última mensagem foi do contato — incluindo a prévia da mensagem e há quanto tempo está aguardando.",
      placement: "top",
    },
  ],
};
