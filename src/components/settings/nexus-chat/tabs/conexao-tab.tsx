"use client";

import { Database } from "lucide-react";
import type { ConnectionDetailData } from "../connection-detail-tabs";
import {
  BindingsTable,
  type BindingTableItem,
} from "../bindings-table";
import { OnboardingWizardLauncher } from "../wizard/onboarding-wizard-launcher";

/**
 * Aba 1 — Conexão.
 *
 * Mostra info técnica do banco + tabela de empresas vinculadas + botão
 * "Cadastrar empresa" (Wizard prefilled com a connection atual).
 *
 * v0.41:
 *  - Header mostra `· intervalo {pollingIntervalSeconds}s` no fim da
 *    linha técnica (visibilidade do polling delta universal).
 *  - Bloco webhook removido (v0.40 fim).
 *  - Botão "Cadastrar empresa" via OnboardingWizardLauncher
 *    (prefilledConnectionId pula o Step Conexão do wizard, abre direto
 *    em Identidade — 2 steps).
 *
 * Itens da spec ainda fora (hotfix v0.41+):
 *  - Card ações (testar/pausar/apagar) — hoje as ações ficam na lista raiz.
 */
export function ConexaoTab({
  connection,
  bindings,
}: {
  connection: ConnectionDetailData;
  bindings: BindingTableItem[];
}) {
  // Connection minimal pra Wizard. Quando prefilled, o Wizard pula o Step
  // 1 (Conexão) e usa connectionId direto. O array só precisa conter a
  // conn atual com shape WizardConnection.
  const wizardConnection = {
    id: connection.id,
    name: connection.name,
    status: connection.status,
  };

  return (
    <div className="grid gap-4">
      <header
        data-tour="conexao-header"
        className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Database className="h-5 w-5 text-violet-500" aria-hidden />
        </div>
        <div className="grid gap-0.5">
          <h2 className="font-heading text-base font-medium">
            {connection.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {connection.host}:{connection.port} · banco{" "}
            <code className="font-mono">{connection.database}</code> · usuário{" "}
            <code className="font-mono">{connection.username}</code> · SSL{" "}
            <code className="font-mono">{connection.sslMode}</code> · intervalo{" "}
            <span className="tabular-nums">
              {connection.pollingIntervalSeconds}s
            </span>
          </p>
        </div>
      </header>

      <section
        data-tour="conexao-empresas"
        className="grid gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">
            Empresas vinculadas
          </h3>
          <div data-tour="conexao-add-empresa">
            <OnboardingWizardLauncher
              connections={[wizardConnection]}
              prefilledConnectionId={connection.id}
            />
          </div>
        </div>
        <div data-tour="conexao-bindings-table">
          <BindingsTable connectionId={connection.id} bindings={bindings} />
        </div>
      </section>
    </div>
  );
}
