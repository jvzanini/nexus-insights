"use client";

/**
 * ConnectSnippetTab — tab Snippet M (Power Query) da Connect page.
 *
 * Conteúdo:
 *  - Header explicativo com instruções (Power Query Editor → Avançado).
 *  - Accordion (CollapsibleSection) com 1 item por view derivada.
 *  - Cada item expandido mostra `<SnippetBlock multiline>` com o snippet M.
 *  - Empty state quando `views.length === 0`.
 *
 * Os snippets são gerados client-side via `generateMSnippet`. Não há senha
 * inline — Power BI pede credencial na primeira execução.
 */

import { Database, FileCode2, Info } from "lucide-react";

import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { generateMSnippet } from "@/lib/integrations/power-bi/m-snippet-generator";

import { SnippetBlock } from "./snippet-block";

export interface ConnectSnippetView {
  table: string;
  label: string;
  viewName: string;
}

interface Props {
  host: string;
  port: number;
  database: string;
  views: ConnectSnippetView[];
}

export function ConnectSnippetTab({ host, port, database, views }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"
          >
            <FileCode2 className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-semibold text-foreground">
            Snippets Power Query M
          </h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Cole no Power Query Editor → Avançado.
        </p>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
          <Info
            aria-hidden="true"
            className="mt-0.5 h-3 w-3 shrink-0"
          />
          Cada bloco abaixo conecta a uma view derivada do seu perfil. Power BI
          pedirá autenticação (PostgreSQL Database) na primeira execução —
          NÃO há senha inline.
        </p>
      </header>

      {/* Accordion de snippets */}
      {views.length === 0 ? (
        <div
          data-testid="connect-snippet-empty"
          className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center"
        >
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          >
            <Database className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-foreground">
            Sem views liberadas neste perfil
          </p>
          <p className="text-xs text-muted-foreground">
            Edite a whitelist do perfil para liberar tabelas.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-testid="connect-snippet-list">
          {views.map((view, idx) => {
            const snippet = generateMSnippet({
              host,
              port,
              database,
              viewName: view.viewName,
            });
            return (
              <CollapsibleSection
                key={view.viewName}
                defaultOpen={idx === 0}
                title={view.label}
                icon={
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300"
                  >
                    <Database className="h-3.5 w-3.5" />
                  </span>
                }
              >
                <div className="flex flex-col gap-3">
                  <div
                    className="text-[11px] font-mono text-muted-foreground"
                    data-testid={`connect-snippet-viewname-${view.viewName}`}
                  >
                    {view.viewName}
                  </div>
                  <SnippetBlock value={snippet} multiline />
                </div>
              </CollapsibleSection>
            );
          })}
        </div>
      )}
    </div>
  );
}
