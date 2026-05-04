import { Users, Crown, Clock, Inbox } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { InteractiveBarChart, EmptyChartState } from "@/components/charts";
import { ErrorState } from "@/components/error-state";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import { rankingAtendentes } from "@/lib/chatwoot/queries/ranking-atendentes";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";

import type { DashboardContentProps } from "./types";
import { RankingAtendentesTable } from "./ranking-atendentes-table";

export async function RankingAtendentesContent({
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

    const result = await rankingAtendentes({
      connectionId,
      accountId,
      filters,
      limit: 50,
    });
    const rows = result.data;
    const totalAtendentes = rows.length;
    const topAgent = rows[0] ?? null;

    const p50Values = rows
      .map((r) => r.p50FirstResponseSec)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const avgP50 =
      p50Values.length > 0
        ? Math.round(p50Values.reduce((a, b) => a + b, 0) / p50Values.length)
        : 0;

    const top10ChartData = rows.slice(0, 10).map((r) => ({
      name: r.name ?? `User ${r.userId}`,
      Volume: r.volume,
    }));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Ranking de atendentes
            </h2>
            <p className="text-xs text-muted-foreground">
              Performance individual no período.
            </p>
          </div>
          {result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null}
        </div>

        {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            icon={Users}
            label="Total de atendentes"
            value={totalAtendentes.toLocaleString("pt-BR")}
            hint="ativos no período"
          />
          <KpiCard
            icon={Crown}
            label="Top atendente"
            value={topAgent?.name ?? "—"}
            hint={
              topAgent
                ? `${topAgent.volume.toLocaleString("pt-BR")} conversas`
                : "sem dados"
            }
          />
          <KpiCard
            icon={Clock}
            label="Tempo médio 1ª resposta"
            value={avgP50 > 0 ? formatDuration(avgP50) : "—"}
            hint="média dos p50 individuais"
          />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              Sem atendentes com atividade no período
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ajuste o período acima para ver outros resultados.
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-muted/30 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold tracking-tight">
                  Top 10 atendentes por volume
                </h3>
                <p className="text-xs text-muted-foreground">
                  Conversas atribuídas no período.
                </p>
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
                  ariaLabel="Top 10 atendentes por volume"
                />
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <RankingAtendentesTable rows={rows} />
            </div>
          </>
        )}
      </div>
    );
  } catch (err) {
    console.error("[RankingAtendentesContent] erro:", err);
    return (
      <ErrorState
        title="Não foi possível carregar Ranking de atendentes"
        message="Tente novamente em instantes ou ajuste o período selecionado."
      />
    );
  }
}
