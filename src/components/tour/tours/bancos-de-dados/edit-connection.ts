import type { TourConfig } from "../../tour-provider";

/**
 * Tour do Dialog `Editar conexão`. 4 steps cobrindo os campos do form.
 *
 * Targets via `[data-tour='conn-form-*']` em `connection-form-dialog.tsx`.
 */
export const editConnectionTour: TourConfig = {
  id: "bancos-de-dados-edit-connection",
  title: "Editar conexão",
  steps: [
    {
      id: "name",
      targetSelector: "[data-tour='conn-form-name']",
      title: "Nome amigável",
      description:
        "Identifica a conexão na lista. Ex: 'VPS Cliente X'.",
      placement: "bottom",
    },
    {
      id: "host-port",
      targetSelector: "[data-tour='conn-form-host']",
      title: "Host e Porta",
      description:
        "Endereço do banco Postgres do Nexus Chat. Padrão Postgres é porta 5432.",
      placement: "bottom",
    },
    {
      id: "credentials",
      targetSelector: "[data-tour='conn-form-credentials']",
      title: "Credenciais",
      description:
        "Banco, usuário e senha do Postgres. Recomendamos usuário read-only. Senha cifrada AES-256-GCM.",
      placement: "right",
    },
    {
      id: "polling",
      targetSelector: "[data-tour='conn-form-polling']",
      title: "Intervalo de sincronização",
      description:
        "Frequência com que o Nexus Insights consulta o banco. Mínimo 20s. Padrão 30s.",
      placement: "left",
    },
  ],
};
