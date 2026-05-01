import type { TourConfig } from "@/components/tour/tour-provider";

export const conversasTour: TourConfig = {
  id: "conversas-v2", // bump pra forçar re-onboarding após revamp v0.17
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
        "Digite e pressione Enter para buscar em nome, WhatsApp, documento, departamento, atendente, status, prioridade, etiquetas e atributos.",
      placement: "bottom",
    },
    {
      id: "filters-chip",
      targetSelector: "[data-tour='filters-chip']",
      title: "Filtros avançados",
      description:
        "Refine por caixa de entrada, departamento, atendente, status, prioridade e etiquetas. Modos Simples e Avançado (E/OU).",
      placement: "bottom",
    },
    {
      id: "sorting-chip",
      targetSelector: "[data-tour='sorting-chip']",
      title: "Ordenação",
      description: "Combine múltiplos critérios de ordenação em sequência.",
      placement: "bottom",
    },
    {
      id: "export",
      targetSelector: "[data-tour='export']",
      title: "Exportar",
      description:
        "Gera planilha XLSX com todos os resultados (até 50.000), respeitando filtros, ordenação e busca.",
      placement: "bottom",
    },
    {
      id: "presets",
      targetSelector: "[data-tour='presets']",
      title: "Filtros salvos",
      description:
        "Salve combinações de filtros + ordenação como presets favoritos. Use o botão Atalhos (raio) para filtros rápidos do dia a dia.",
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
        "Clique em qualquer parte da linha (exceto o número) para expandir e ver WhatsApp, etiquetas e atributos.",
      placement: "right",
    },
    {
      id: "open-action",
      targetSelector: "[data-tour='open-action']",
      title: "Abrir no Chatwoot",
      description:
        "Clique no número da conversa (#) para abrir direto no Chatwoot, em uma nova aba.",
      placement: "right",
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
