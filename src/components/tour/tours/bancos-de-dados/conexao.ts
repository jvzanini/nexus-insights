import type { TourConfig } from "../../tour-provider";

/**
 * Tour da Aba 1 — Conexão. 4 steps:
 *  1. Intro — config técnica do banco no header.
 *  2. Empresas vinculadas — lista de bindings (account_id ↔ company).
 *  3. Cadastrar empresa — Wizard prefilled (pula Step 1).
 *  4. Tabela de bindings — colunas + ações por linha.
 *
 * Targets via `[data-tour='conexao-*']` em `tabs/conexao-tab.tsx`.
 */
export const conexaoTour: TourConfig = {
  id: "bancos-de-dados-conexao",
  title: "Aba Conexão",
  steps: [
    {
      id: "header",
      targetSelector: "[data-tour='conexao-header']",
      title: "Configuração técnica desta conexão",
      description:
        "Host, porta, banco, usuário, modo SSL e intervalo de sincronização (polling delta). Para alterar, use o Editar na lista raiz.",
      placement: "bottom",
    },
    {
      id: "empresas",
      targetSelector: "[data-tour='conexao-empresas']",
      title: "Empresas vinculadas a esta conexão",
      description:
        "Cada vínculo (binding) mapeia um account_id do Nexus Chat para uma empresa no Nexus Insights. Uma conexão pode hospedar várias empresas.",
      placement: "top",
    },
    {
      id: "add-empresa",
      targetSelector: "[data-tour='conexao-add-empresa']",
      title: "Cadastrar empresa nesta conexão",
      description:
        "Abre o assistente já com o passo de Conexão preenchido — você só preenche o account_id, o nome amigável e confirma.",
      placement: "left",
    },
    {
      id: "bindings-table",
      targetSelector: "[data-tour='conexao-bindings-table']",
      title: "Tabela de empresas vinculadas",
      description:
        "Cada linha mostra account_id, empresa, status e ações (testar, editar, desativar). Bindings desativados ficam invisíveis para os relatórios.",
      placement: "top",
    },
  ],
};
