import { Clock, Timer, Gauge, CheckCircle2, Building2 } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { PeriodSelectorUrl } from "@/components/reports/period-selector-url";
import {
  getPeriod,
  type PeriodKey,
} from "@/lib/reports/period";
import { getCurrentUser } from "@/lib/auth";
import { temposResposta } from "@/lib/chatwoot/queries/tempos-resposta";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";

export const metadata = { title: "Tempos de resposta | Nexus Insights" };
export const dynamic = "force-dynamic";

const ACCOUNT_ID = 9;

const VALID_PERIODS: PeriodKey[] = [
  "hoje",
  "ontem",
  "7d",
  "30d",
  "mes_atual",
  "mes_anterior",
];

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function Page({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const periodRaw =
    typeof sp.period === "string" ? (sp.period as PeriodKey) : null;
  const period: PeriodKey =
    periodRaw && VALID_PERIODS.includes(periodRaw) ? periodRaw : "30d";

  const range = getPeriod(period);
  const filters: ReportFilters = { period: range };

  const result = await temposResposta({
    accountId: ACCOUNT_ID,
    filters,
  });

  const { first_response, resolution, business_hours } = result.data;
  const hasFirstResponse = first_response.count > 0;
  const hasResolution = resolution.count > 0;

  return (
    <div>
      <PageHeader
        icon={Clock}
        title="Tempos de resposta"
        subtitle="Métricas de atendimento"
        actions={
          result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null
        }
      />

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="mb-6">
        <PeriodSelectorUrl value={period} />
      </div>

      {!hasFirstResponse && !hasResolution ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sem eventos de resposta ou resolução no período selecionado.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Timer}
              label="1ª resposta (média)"
              value={formatDuration(first_response.avg)}
              hint={`${first_response.count.toLocaleString("pt-BR")} eventos`}
            />
            <KpiCard
              icon={Gauge}
              label="1ª resposta (p50)"
              value={formatDuration(first_response.p50)}
              hint="mediana"
            />
            <KpiCard
              icon={Gauge}
              label="1ª resposta (p95)"
              value={formatDuration(first_response.p95)}
              hint="95º percentil"
              tone={first_response.p95 > 3600 ? "warning" : "default"}
            />
            <KpiCard
              icon={CheckCircle2}
              label="Resolução (média)"
              value={formatDuration(resolution.avg)}
              hint={`${resolution.count.toLocaleString("pt-BR")} resolvidas`}
            />
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
                <Building2 className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight">
                  Horário comercial vs total
                </h2>
                <p className="text-xs text-muted-foreground">
                  Médias considerando apenas o expediente configurado no
                  Chatwoot.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Métrica</th>
                    <th className="px-4 py-2 text-right font-medium">Total</th>
                    <th className="px-4 py-2 text-right font-medium">
                      Hor. comercial
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  <tr>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      1ª resposta (média)
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatDuration(first_response.avg)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatDuration(business_hours.first_response_avg)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      Resolução (média)
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatDuration(resolution.avg)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {formatDuration(business_hours.resolution_avg)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
