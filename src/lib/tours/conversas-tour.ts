import type { TourConfig } from "@/components/tour/tour-provider";

export const conversasTour: TourConfig = {
  id: "conversas",
  title: "Tour do relatório de Conversas",
  steps: [
    {
      id: "period",
      targetSelector: "[data-tour='period']",
      title: "Período",
      description:
        "Escolha um período rápido (Hoje, Esta semana, Este mês, Todos) ou clique em Personalizado para definir um intervalo específico.",
      placement: "bottom",
    },
    {
      id: "search",
      targetSelector: "[data-tour='search']",
      title: "Busca rápida",
      description:
        "Pesquise por nome, telefone ou documento. Pressione Enter para aplicar a busca aos resultados.",
      placement: "bottom",
    },
    {
      id: "filters-chip",
      targetSelector: "[data-tour='filters-chip']",
      title: "Filtros avançados",
      description:
        "Refine por caixa de entrada, departamento, atendente, status e prioridade. Abre painel centralizado com modos Simples e Avançado (E/OU).",
      placement: "bottom",
    },
    {
      id: "sorting-chip",
      targetSelector: "[data-tour='sorting-chip']",
      title: "Ordenação",
      description:
        "Combine múltiplos critérios de ordenação em sequência.",
      placement: "bottom",
    },
    {
      id: "columns",
      targetSelector: "[data-tour='columns']",
      title: "Colunas visíveis",
      description:
        "Mostre ou oculte colunas conforme sua necessidade. Suas preferências ficam salvas localmente.",
      placement: "top",
    },
    {
      id: "page-size",
      targetSelector: "[data-tour='page-size']",
      title: "Tamanho da página",
      description:
        "Escolha 50 ou 100 conversas por página, ou 'Todos' para carregar tudo (até o limite máximo).",
      placement: "top",
    },
    {
      id: "table",
      targetSelector: "[data-tour='table']",
      title: "Lista de conversas",
      description:
        "Cada linha mostra contato, departamento, atendente, status, prioridade e tempos. Cores indicam urgência (âmbar acima de 4h, vermelho acima de 24h).",
      placement: "top",
    },
    {
      id: "drill-down",
      targetSelector: "[data-tour='drill-down']",
      title: "Drill-down inline",
      description:
        "Clique na linha para expandir e ver WhatsApp, etiquetas e atributos completos sem sair do relatório.",
      placement: "right",
    },
    {
      id: "open-action",
      targetSelector: "[data-tour='open-action']",
      title: "Abrir no Chatwoot",
      description:
        "Clique em Abrir para ir direto à conversa no Chatwoot, em uma nova aba.",
      placement: "left",
    },
    {
      id: "refresh",
      targetSelector: "[data-tour='refresh']",
      title: "Atualizar dados",
      description:
        "Os dados são cacheados por alguns minutos para acelerar a navegação. Use Atualizar para forçar a busca dos dados mais recentes.",
      placement: "left",
    },
  ],
};
