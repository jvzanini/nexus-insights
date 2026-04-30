import { Timer, Gauge, CheckCircle2, Building2 } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { InteractiveBarChart, EmptyChartState } from "@/components/charts";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { temposResposta } from "@/lib/chatwoot/queries/tempos-resposta";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";
import { CHART_COLORS } from "@/lib/charts/colors";

import type { DashboardContentProps } from "./types";

export async function TemposRespostaContent({
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  const { range } = await resolvePeriod({ period, customStart, customEnd });
  const filters: ReportFilters = { period: range };

  const result = await temposResposta({ accountId, filters });
  const { first_response, resolution, business_hours } = result.data;
  const hasFirstResponse = first_response.count > 0;
  const hasResolution = resolution.count > 0;

  const compareData = [
    {
      name: "1ª resposta",
      Total: first_response.avg ?? 0,
      "Hor. comercial": business_hours.first_response_avg ?? 0,
    },
    {
      name: "Resolução",
      Total: resolution.avg ?? 0,
      "Hor. comercial": business_hours.resolution_avg ?? 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Tempos de resposta
          </h2>
          <p className="text-xs text-muted-foreground">
            Métricas de primeira resposta e resolução.
          </p>
        </div>
        {result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null}
      </div>

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      {!hasFirstResponse && !hasResolution ? (
        <div className="rounded-2xl border border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Sem eventos de resposta ou resolução no período selecionado.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <h3 className="text-sm font-semibold tracking-tight">
                  Total vs horário comercial
                </h3>
                <p className="text-xs text-muted-foreground">
                  Médias considerando todo o período vs apenas o expediente
                  configurado no Chatwoot.
                </p>
              </div>
            </div>
            {compareData.every((d) => d.Total === 0 && d["Hor. comercial"] === 0) ? (
              <EmptyChartState
                message="Sem dados de tempo no período"
                height={260}
              />
            ) : (
              <InteractiveBarChart
                data={compareData}
                series={[
                  { key: "Total", label: "Total", color: CHART_COLORS.violet },
                  {
                    key: "Hor. comercial",
                    label: "Hor. comercial",
                    color: CHART_COLORS.emerald,
                  },
                ]}
                height={260}
                formatValue={(v) => formatDuration(v)}
                ariaLabel="Tempos médios: total vs horário comercial"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
