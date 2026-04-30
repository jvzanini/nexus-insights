import { Users, Crown, Clock, Inbox } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import { KpiCard } from "@/components/reports/kpi-card";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";
import { Badge } from "@/components/ui/badge";
import {
  InteractiveBarChart,
  EmptyChartState,
} from "@/components/charts";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import {
  rankingAtendentes,
  type RankingAtendentesRow,
} from "@/lib/chatwoot/queries/ranking-atendentes";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";

import type { DashboardContentProps } from "./types";

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export async function RankingAtendentesContent({
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  const { range } = await resolvePeriod({ period, customStart, customEnd });
  const filters: ReportFilters = { period: range };

  const result = await rankingAtendentes({ accountId, filters, limit: 50 });
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

  const columns: SortableColumn<RankingAtendentesRow>[] = [
    {
      key: "name",
      label: "Atendente",
      sortable: true,
      align: "left",
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-300">
            {getInitials(row.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {row.name ?? `User ${row.userId}`}
            </p>
            {row.email ? (
              <p className="truncate text-xs text-muted-foreground">
                {row.email}
              </p>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: "volume",
      label: "Volume",
      sortable: true,
      align: "right",
      render: (row) => (
        <Badge variant="secondary">{row.volume.toLocaleString("pt-BR")}</Badge>
      ),
    },
    {
      key: "resolved",
      label: "Resolvidas",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm font-medium tabular-nums">
          {row.resolved.toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      key: "p50FirstResponseSec",
      label: "p50 1ª resposta",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.p50FirstResponseSec
            ? formatDuration(row.p50FirstResponseSec)
            : "—"}
        </span>
      ),
    },
  ];

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
            <SortableTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.userId}
              initialSort={{ key: "volume", direction: "desc" }}
              emptyMessage="Sem atendentes no período."
            />
          </div>
        </>
      )}
    </div>
  );
}
