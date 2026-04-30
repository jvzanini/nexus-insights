import type { TourConfig } from "@/components/tour/tour-provider";

export const conversasTour: TourConfig = {
  id: "conversas",
  title: "Tour do relatório de Conversas",
  steps: [
    {
      id: "filters",
      targetSelector: "[data-tour='filters']",
      title: "Filtros avançados",
      description:
        "Selecione o período, caixas, equipes, atendentes, status e prioridade. Clique em 'Aplicar filtros' para atualizar a lista.",
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
      id: "table",
      targetSelector: "[data-tour='table']",
      title: "Lista de conversas",
      description:
        "Cada linha mostra a conversa com contato, departamento, atendente, status e prioridade. Use o botão de ações para abrir no Chatwoot.",
      placement: "top",
    },
    {
      id: "load-more",
      targetSelector: "[data-tour='load-more']",
      title: "Carregar mais resultados",
      description:
        "A lista carrega em lotes para manter a performance. Use 'Carregar mais' para ver as conversas seguintes.",
      placement: "top",
    },
  ],
};
