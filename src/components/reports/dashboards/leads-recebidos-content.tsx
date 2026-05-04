import { Sigma, TrendingUp, BarChart2 } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { GranularitySelector } from "@/components/reports/granularity-selector";
import { InteractiveAreaChart, EmptyChartState } from "@/components/charts";
import { ErrorState } from "@/components/error-state";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { shouldExcludeMatrixIA } from "@/lib/reports/exclude-matrix-ia";
import {
  leadsRecebidos,
  type Granularity,
} from "@/lib/chatwoot/queries/leads-recebidos";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { CHART_COLORS } from "@/lib/charts/colors";

import type { DashboardContentProps } from "./types";

interface LeadsRecebidosContentProps extends DashboardContentProps {
  granularity: Granularity;
}

function formatBucket(bucket: string, granularity: Granularity): string {
  const d = new Date(`${bucket}T00:00:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export async function LeadsRecebidosContent({
  connectionId,
  accountId,
  period,
  customStart,
  customEnd,
  granularity,
}: LeadsRecebidosContentProps) {
  let result;
  try {
    const { range } = await resolvePeriod({ period, customStart, customEnd });
    const excludeMatrixIA = await shouldExcludeMatrixIA();
    const filters: ReportFilters = { period: range, excludeMatrixIA };
    result = await leadsRecebidos({
      connectionId,
      accountId,
      filters,
      granularity,
      compareWith: true,
    });
  } catch (err) {
    console.error("[LeadsRecebidosContent] erro:", err);
    return (
      <ErrorState
        title="Não foi possível carregar Leads recebidos"
        message="Tente novamente em instantes ou ajuste o período selecionado."
      />
    );
  }

  const rows = result.data.rows;
  const comparison = result.data.comparison;

  const total = rows.reduce((acc, r) => acc + r.total, 0);
  const avg =
    rows.length > 0 ? Math.round((total / rows.length) * 10) / 10 : 0;
  const peak = rows.reduce((acc, r) => (r.total > acc ? r.total : acc), 0);

  const chartData = rows.map((r) => ({
    name: formatBucket(r.bucket, granularity),
    Leads: r.total,
  }));

  const granularityLabel =
    granularity === "day"
      ? "Média diária"
      : granularity === "week"
        ? "Média semanal"
        : "Média mensal";

  const granularityNoun =
    granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Leads recebidos
          </h2>
          <p className="text-xs text-muted-foreground">
            Volume de leads (conversas criadas) por período.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <GranularitySelector value={granularity} />
          {result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null}
        </div>
      </div>

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Sigma}
          label="Total no período"
          value={total.toLocaleString("pt-BR")}
          delta={
            comparison
              ? {
                  percent: comparison.deltaPct,
                  direction: comparison.direction,
                  period: "vs período anterior",
                }
              : undefined
          }
        />
        <KpiCard
          icon={TrendingUp}
          label={granularityLabel}
          value={avg.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={BarChart2}
          label="Pico no período"
          value={peak.toLocaleString("pt-BR")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold tracking-tight">
            Volume ao longo do tempo
          </h3>
          <p className="text-xs text-muted-foreground">
            Conversas criadas por {granularityNoun}.
          </p>
        </div>
        {rows.length === 0 || total === 0 ? (
          <EmptyChartState
            message="Sem leads no período selecionado"
            height={320}
          />
        ) : (
          <InteractiveAreaChart
            data={chartData}
            series={[
              { key: "Leads", label: "Leads", color: CHART_COLORS.violet },
            ]}
            height={320}
            ariaLabel="Volume de leads ao longo do tempo"
          />
        )}
      </div>
    </div>
  );
}
