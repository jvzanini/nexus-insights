"use client";

import { Database } from "lucide-react";
import type { ConnectionDetailData } from "../connection-detail-tabs";
import {
  BindingsTable,
  type BindingTableItem,
} from "../bindings-table";

/**
 * Aba 1 — Conexão.
 *
 * Mostra info técnica do banco + bloco webhook + tabela de empresas
 * vinculadas. É a tab default e oferece todas as ações operacionais
 * primárias (editar, testar, apagar, gerenciar bindings).
 *
 * Conteúdo (Fase 3 v1):
 *  - Card identidade (nome, status badge, last_test_at).
 *  - Card banco (host masked, porta, banco, usuário, sslMode).
 *  - Tabela de empresas (BindingsTable já existente da v0.39).
 *
 * Itens da spec ainda fora desta v1 (ficam para hotfix v0.41+):
 *  - Card webhook (URL+texto explicando token-only) — hoje fica no Dialog.
 *  - Card ações (testar/pausar/apagar) — hoje as ações ficam na lista raiz.
 *
 * Justificativa: para a Fase 3 entregar valor sem regressão, mantém o
 * fluxo atual (ações na lista) e adiciona a tabela de empresas como
 * conteúdo principal da aba — coerente com o que o super_admin já espera.
 */
export function ConexaoTab({
  connection,
  bindings,
}: {
  connection: ConnectionDetailData;
  bindings: BindingTableItem[];
}) {
  return (
    <div className="grid gap-4">
      <header className="flex items-start gap-3 rounded-2xl border border-border bg-muted/30 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
          <Database className="h-5 w-5 text-violet-500" aria-hidden />
        </div>
        <div className="grid gap-0.5">
          <h2 className="font-heading text-base font-medium">{connection.name}</h2>
          <p className="text-xs text-muted-foreground">
            {connection.host}:{connection.port} · banco{" "}
            <code className="font-mono">{connection.database}</code> · usuário{" "}
            <code className="font-mono">{connection.username}</code> · SSL{" "}
            <code className="font-mono">{connection.sslMode}</code>
          </p>
        </div>
      </header>

      <BindingsTable connectionId={connection.id} bindings={bindings} />
    </div>
  );
}
