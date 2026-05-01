"use client";

/**
 * ConnectServiceTab — tab Power BI Service / Gateway da Connect page.
 *
 * Conteúdo:
 *  - Box destacado violet "On-premises Data Gateway" (recomendado): tutorial
 *    numerado 1–5 explicando como instalar e linkar gateway.
 *  - Box separado amarelo "Acesso direto via internet (alternativa)":
 *    avisos de segurança sobre abrir 5432 e compartilhar .pbix.
 *
 * Sem state — somente conteúdo estático informativo. Client component apenas
 * por convenção da Connect page (poderia ser server, mas mantemos coerência
 * de tabs sendo sempre client).
 */

import {
  AlertTriangle,
  CheckCircle2,
  CloudCog,
  ShieldCheck,
} from "lucide-react";

const GATEWAY_STEPS: readonly string[] = [
  "Pesquisar \"On-premises data gateway\" no site oficial da Microsoft e baixar.",
  "Instalar em uma VM/PC interno do cliente que tem acesso ao banco.",
  "Configurar o gateway com a conta Power BI do cliente.",
  "No Power BI Service, adicionar fonte de dados PostgreSQL apontando para <host privado>:5432 (acesso de rede interna do gateway).",
  "Publicar relatório do Power BI Desktop → vincular ao gateway.",
] as const;

export function ConnectServiceTab() {
  return (
    <div className="flex flex-col gap-6">
      {/* Recomendação Gateway */}
      <section
        data-testid="service-gateway-recommended"
        className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5"
      >
        <header className="flex items-start gap-3 border-b border-violet-500/20 pb-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300"
          >
            <CloudCog className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                On-premises Data Gateway
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                Recomendado
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Para publicar relatórios na nuvem do Power BI compartilhando com
              vários usuários, use o On-premises Data Gateway (gratuito da
              Microsoft).
            </p>
          </div>
        </header>

        <ol
          data-testid="service-gateway-steps"
          className="flex flex-col gap-2.5 pt-4"
        >
          {GATEWAY_STEPS.map((step, idx) => {
            const num = idx + 1;
            return (
              <li
                key={num}
                data-testid={`service-gateway-step-${num}`}
                className="flex items-start gap-3"
              >
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-[11px] font-semibold text-violet-700 dark:text-violet-300"
                >
                  {num}
                </span>
                <span className="text-sm text-foreground leading-relaxed">
                  {step}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Acesso direto (alternativa) */}
      <section
        data-testid="service-direct-alternative"
        className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:p-5"
      >
        <header className="flex items-start gap-3 border-b border-amber-500/30 pb-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
              Acesso direto via internet (alternativa)
            </h3>
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
              Acesso direto requer abrir a porta 5432 do banco para a internet
              — menos seguro. Se for necessário:
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-3 pt-4">
          <ul className="flex flex-col gap-2">
            <li className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
              />
              Configurar IP allowlist (ver runbook).
            </li>
            <li className="flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-400"
              />
              Garantir TLS válido (cert Let&apos;s Encrypt).
            </li>
          </ul>

          <div className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-2.5">
            <p className="text-xs text-amber-900 dark:text-amber-100 leading-relaxed">
              <strong>Aviso:</strong> o .pbix salvo localmente armazena a
              credencial. Compartilhar o arquivo é compartilhar acesso ao
              banco. Use Gateway sempre que possível.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
