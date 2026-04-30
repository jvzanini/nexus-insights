import { Inbox, CheckCircle2, Clock4, Moon } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import { DonutWithCenter, EmptyChartState } from "@/components/charts";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import { statusDistribution } from "@/lib/chatwoot/queries/status-distribution";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { CHART_COLORS } from "@/lib/charts/colors";

import type { DashboardContentProps } from "./types";

const STATUS_LABEL: Record<number, string> = {
  0: "Em aberto",
  1: "Resolvidas",
  2: "Pendentes",
  3: "Adiadas",
};

const STATUS_COLOR: Record<number, string> = {
  0: CHART_COLORS.blue,
  1: CHART_COLORS.emerald,
  2: CHART_COLORS.amber,
  3: CHART_COLORS.violet,
};

export async function StatusPieContent({
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  const { range } = await resolvePeriod({ period, customStart, customEnd });
  const filters: ReportFilters = { period: range };

  const result = await statusDistribution({ accountId, filters });

  const map = new Map<number, number>();
  for (const r of result.data) map.set(r.status, r.total);

  const open = map.get(0) ?? 0;
  const resolved = map.get(1) ?? 0;
  const pending = map.get(2) ?? 0;
  const snoozed = map.get(3) ?? 0;
  const total = open + resolved + pending + snoozed;

  const donutData = [
    { name: STATUS_LABEL[0]!, value: open, color: STATUS_COLOR[0] },
    { name: STATUS_LABEL[1]!, value: resolved, color: STATUS_COLOR[1] },
    { name: STATUS_LABEL[2]!, value: pending, color: STATUS_COLOR[2] },
    { name: STATUS_LABEL[3]!, value: snoozed, color: STATUS_COLOR[3] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Status das conversas
          </h2>
          <p className="text-xs text-muted-foreground">
            Distribuição entre aberto, resolvido, pendente e adiado.
          </p>
        </div>
        {result.cachedAt ? <CachedBadge cachedAt={result.cachedAt} /> : null}
      </div>

      {result.stale ? <StaleBanner cachedAt={result.cachedAt} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Inbox}
          label="Em aberto"
          value={open.toLocaleString("pt-BR")}
          tone="warning"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Resolvidas"
          value={resolved.toLocaleString("pt-BR")}
          tone="success"
        />
        <KpiCard
          icon={Clock4}
          label="Pendentes"
          value={pending.toLocaleString("pt-BR")}
        />
        <KpiCard
          icon={Moon}
          label="Adiadas"
          value={snoozed.toLocaleString("pt-BR")}
        />
      </div>

      <div className="rounded-2xl border border-border bg-muted/30 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold tracking-tight">
            Distribuição por status
          </h3>
          <p className="text-xs text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString("pt-BR")} conversas no período.`
              : "Sem dados no período."}
          </p>
        </div>

        {total === 0 ? (
          <EmptyChartState
            message="Sem conversas no período selecionado"
            hint="Ajuste o período acima para ver outros resultados."
            height={320}
          />
        ) : (
          <div className="flex justify-center">
            <DonutWithCenter
              data={donutData}
              centerLabel="Total"
              centerValue={total.toLocaleString("pt-BR")}
              height={320}
              ariaLabel="Distribuição de status"
            />
          </div>
        )}
      </div>
    </div>
  );
}
