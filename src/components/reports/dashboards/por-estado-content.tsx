import { Inbox, BarChart3 } from "lucide-react";

import { CachedBadge } from "@/components/reports/cached-badge";
import { StaleBanner } from "@/components/reports/stale-banner";
import {
  SortableTable,
  type SortableColumn,
} from "@/components/ui/sortable-table";
import { Badge } from "@/components/ui/badge";
import { InteractiveBarChart, EmptyChartState } from "@/components/charts";
import { resolvePeriod } from "@/lib/reports/resolve-period";
import {
  porEstado,
  type PorEstadoRow,
} from "@/lib/chatwoot/queries/por-estado";
import type { ReportFilters } from "@/lib/chatwoot/filters";
import { formatDuration } from "@/lib/utils/format-time";

import type { DashboardContentProps } from "./types";

function extractUf(inboxName: string): string {
  const match = inboxName.match(/^([A-Za-z]{2})\b/);
  if (match) return match[1]!.toUpperCase();
  return inboxName.slice(0, 2).toUpperCase();
}

export async function PorEstadoContent({
  accountId,
  period,
  customStart,
  customEnd,
}: DashboardContentProps) {
  const { range } = await resolvePeriod({ period, customStart, customEnd });
  const filters: ReportFilters = { period: range };

  const result = await porEstado({ accountId, filters });
  const rows = result.data;

  const top10ChartData = rows.slice(0, 10).map((r) => ({
    name: r.inboxName,
    Volume: r.volume,
  }));

  const columns: SortableColumn<PorEstadoRow>[] = [
    {
      key: "inboxName",
      label: "Estado",
      sortable: true,
      align: "left",
      render: (row) => {
        const uf = extractUf(row.inboxName);
        return (
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="font-mono text-[11px]">
              {uf}
            </Badge>
            <span className="truncate text-sm font-medium">
              {row.inboxName}
            </span>
          </div>
        );
      },
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
      key: "topAgentName",
      label: "Top atendente",
      sortable: true,
      align: "left",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.topAgentName ?? "—"}
        </span>
      ),
    },
    {
      key: "avgFirstResponseSec",
      label: "Tempo médio 1ª resposta",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.avgFirstResponseSec
            ? formatDuration(row.avgFirstResponseSec)
            : "—"}
        </span>
      ),
    },
  ];

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
            <SortableTable
              columns={columns}
              rows={rows}
              rowKey={(r) => r.inboxId}
              initialSort={{ key: "volume", direction: "desc" }}
              emptyMessage="Sem estados no período."
            />
          </div>
        </>
      )}
    </div>
  );
}
