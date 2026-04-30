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
    {
      id: "time",
      targetSelector: "[data-tour='mnr-time']",
      title: "Aguardando há",
      description:
        "Coluna que mostra há quanto tempo a conversa está sem resposta do time. Cores: âmbar a partir de 4h, vermelho a partir de 24h.",
      placement: "top",
    },
    {
      id: "open",
      targetSelector: "[data-tour='mnr-open']",
      title: "Abrir no Chatwoot",
      description:
        "Clique em Abrir para ir direto à conversa no Chatwoot, em uma nova aba, e responder o cliente.",
      placement: "left",
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
