import { Inbox, BarChart3 } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { InteractiveBarChart, EmptyChartState } from "@/components/charts";
import { ErrorState } from "@/components/error-state";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { porEstado } from "@/lib/chatwoot/queries/por-estado";
import type { ReportFilters } from "@/lib/chatwoot/filters";

import type { DashboardContentProps } from "./types";
import { PorEstadoTable } from "./por-estado-table";

export async function PorEstadoContent({
  connectionId,
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  try {
    const { range } = await resolvePeriod({ period, customStart, customEnd });
    const excludeMatrixIA = await shouldExcludeMatrixIA();
    const filters: ReportFilters = { period: range, excludeMatrixIA };

    const result = await porEstado({ connectionId, accountId, filters });
    const rows = result.data;

    const top10ChartData = rows.slice(0, 10).map((r) => ({
      name: r.inboxName,
      Volume: r.volume,
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Por estado</h2>
            <p className="text-xs text-muted-foreground">
              Distribuição geográfica por inbox.
            </p>
          </div>
          {result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null}
        </div>

        {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              Sem estados com atividade no período
            </h3>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600/10">
                  <BarChart3 className="h-5 w-5 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">
                    Top 10 estados por volume
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Conversas por inbox no período.
                  </p>
                </div>
              </div>
              {top10ChartData.length === 0 ? (
                <EmptyChartState message="Sem dados no período" height={320} />
              ) : (
                <InteractiveBarChart
                  data={top10ChartData}
                  series={[{ key: "Volume", label: "Conversas" }]}
                  layout="horizontal"
                  height={Math.max(320, top10ChartData.length * 32 + 40)}
                  yAxisWidth={140}
                  ariaLabel="Top 10 estados por volume"
                />
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <PorEstadoTable rows={rows} />
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    console.error("[PorEstadoContent] erro:", err);
    return (
      <ErrorState
        title="Não foi possível carregar Por estado"
        message="Tente novamente em instantes ou ajuste o período selecionado."
      />
    );
  }
}
