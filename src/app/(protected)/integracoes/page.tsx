/**
 * Hub `/integracoes` — Server Component.
 *
 * Lista todas as integrações suportadas (registry) em grid responsivo.
 * Apenas super_admin acessa; demais perfis vão pra /dashboard.
 *
 * Banner de pré-requisitos é exibido quando não há nenhum perfil
 * Power BI cadastrado E nenhum dim_*_snapshot foi populado — sinal
 * de instalação fresh ainda sem provisioning.
 */

import { redirect } from "next/navigation";
import { Plug, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { getCurrentUser } from "@/lib/auth";
import { INTEGRATIONS } from "@/lib/integrations/registry";
import { IntegrationsHubCard } from "@/components/integracoes/integrations-hub-card";
import {
  getIntegrationsSummaryAction,
  getDimSnapshotFreshnessAction,
} from "@/lib/actions/integrations";

export const metadata = { title: "Integrações | Nexus Insights" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.platformRole !== "super_admin") redirect("/dashboard");

  const [summaryResult, freshnessResult] = await Promise.all([
    getIntegrationsSummaryAction(),
    getDimSnapshotFreshnessAction(),
  ]);

  const summary = summaryResult.ok ? summaryResult.data : null;
  const freshness = freshnessResult.ok ? freshnessResult.data : null;

  const totalActive =
    (summary?.powerBi?.active ?? 0) +
    (summary?.powerBi?.disabled ?? 0) +
    (summary?.powerBi?.errored ?? 0);
  const allFreshnessNull =
    !freshness ||
    (freshness.accounts === null &&
      freshness.inboxes === null &&
      freshness.agents === null &&
      freshness.teams === null);
  const showSetupBanner = totalActive === 0 && allFreshnessNull;

  return (
    <PageShell variant="wide">
      <PageHeader
        icon={Plug}
        title="Integrações"
        subtitle="Conecte o Nexus Insights a ferramentas externas como Power BI"
      />

      {showSetupBanner ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Pré-requisitos pendentes
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Antes de criar perfis Power BI, configure o acesso externo ao
              banco de dados. Veja o runbook em{" "}
              <code className="text-xs px-1.5 py-0.5 rounded bg-muted">
                docs/runbooks/integracoes-power-bi.md
              </code>
              .
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATIONS.map((descriptor) => (
          <IntegrationsHubCard
            key={descriptor.kind}
            descriptor={descriptor}
            activeProfilesCount={
              descriptor.kind === "power_bi" && summary
                ? summary.powerBi.active
                : undefined
            }
          />
        ))}
      </div>
    </PageShell>
  );
}
