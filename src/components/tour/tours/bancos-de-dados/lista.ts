import type { TourConfig } from "../../tour-provider";

/**
 * Tour da tela raiz `/bancos-de-dados` (lista de conexões Postgres do
 * Nexus Chat). 4 steps:
 *  1. Intro — explica o que é a lista.
 *  2. Card de conexão — clicável inteiro abre os detalhes.
 *  3. Ações rápidas — testar / editar / apagar in-line.
 *  4. Nova conexão — CTA primário.
 *
 * Targets via `[data-tour='lista-*']` em `connection-list.tsx`.
 */
export const listaTour: TourConfig = {
  id: "bancos-de-dados-lista",
  title: "Bancos de dados",
  steps: [
    {
      id: "intro",
      targetSelector: "[data-tour='lista-header']",
      title: "Suas conexões cadastradas",
      description:
        "Cada linha é um banco Postgres do Nexus Chat. Uma conexão pode hospedar várias empresas (accounts).",
      placement: "bottom",
    },
    {
      id: "card",
      targetSelector: "[data-tour='lista-conn-card']",
      title: "Clique na linha para ver detalhes",
      description:
        "A linha inteira é clicável e abre 4 abas: Conexão (config técnica + empresas), Sincronização, Jobs e Saúde.",
      placement: "right",
    },
    {
      id: "actions",
      targetSelector: "[data-tour='lista-actions']",
      title: "Ações rápidas",
      description:
        "Testar (verifica se o banco responde), Editar (abre o dialog) e Apagar (soft delete reversível). Não é necessário entrar nos detalhes.",
      placement: "left",
    },
    {
      id: "new-connection",
      targetSelector: "[data-tour='lista-new-connection']",
      title: "Cadastrar nova conexão",
      description:
        "Abre o assistente em 3 passos: Conexão (host/porta/credenciais), Identidade (account_id + nome amigável) e Confirmação.",
      placement: "left",
    },
  ],
};
