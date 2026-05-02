"use client";

import { useEffect, useState } from "react";

import {
  InteractiveBarChart,
  type BarChartSeries,
} from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DrillDownSection,
  DrillDownSkeleton,
} from "@/components/ui/drill-down-dialog";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import {
  getNoResponseDrillDownAction,
  type DashboardPeriod,
} from "@/lib/actions/dashboard-drill-down";
import type { NoResponseDrillDownData } from "@/lib/chatwoot/queries/dashboard-drill-down";
import { TotalBadge } from "./total-badge";
import { WaitingBucketsDonut } from "./waiting-buckets-donut";

interface Props {
  accountId: number;
  period: DashboardPeriod;
  enabled: boolean;
}

import { formatDuration } from "@/lib/utils/format-time";

const formatWaiting = formatDuration;

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <p className="text-sm font-medium text-foreground">
        Não foi possível carregar os dados
      </p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

export function NoResponseDrillDownContent({
  accountId,
  period,
  enabled,
}: Props) {
  const [data, setData] = useState<NoResponseDrillDownData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<"inbox" | "assignee">("inbox");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      const res = await getNoResponseDrillDownAction({ accountId, period });
      if (cancelled) return;
      if (res.success && res.data) {
        setData(res.data);
        setError(null);
      } else {
        setError(res.error ?? "Erro desconhecido");
      }
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accountId, period, enabled]);

  if (loading && !data) return <DrillDownSkeleton />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return null;

  const groupData =
    groupBy === "inbox" ? data.byInbox : data.byAssignee;

  const chartData = groupData.map((g) => ({
    name: g.name,
    Conversas: g.count,
  }));
  const series: BarChartSeries[] = [
    { key: "Conversas", label: "Conversas", color: CHART_COLORS.amber },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DrillDownSection
          title="Faixa de espera"
          description="Quanto tempo cada conversa está aguardando agora"
        >
          <WaitingBucketsDonut
            items={data.items}
            total={data.total}
            oldestSeconds={data.oldestSeconds}
          />
        </DrillDownSection>

        <DrillDownSection
          title="Distribuição"
          description="Veja por estado ou por atendente"
          action={
            <div
              role="radiogroup"
              aria-label="Agrupar por"
              className="inline-flex rounded-lg border border-border bg-card/80 p-0.5"
            >
              <button
                type="button"
                role="radio"
                aria-checked={groupBy === "inbox"}
                onClick={() => setGroupBy("inbox")}
                className={`rounded-md px-2.5 py-1 text-xs cursor-pointer transition-all ${
                  groupBy === "inbox"
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Estado
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={groupBy === "assignee"}
                onClick={() => setGroupBy("assignee")}
                className={`rounded-md px-2.5 py-1 text-xs cursor-pointer transition-all ${
                  groupBy === "assignee"
                    ? "bg-violet-600 text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Atendente
              </button>
            </div>
          }
        >
          <InteractiveBarChart
            data={chartData}
            series={series}
            layout="horizontal"
            height={Math.max(220, Math.min(480, chartData.length * 28 + 40))}
            showLegend={false}
            yAxisWidth={160}
            emptyMessage="Sem dados para agrupar"
          />
        </DrillDownSection>
      </div>

      <DrillDownSection
        title={
          <>
            Conversas sem resposta
            <TotalBadge n={data.items.length} />
          </>
        }
        description="Ordenadas pelo tempo de espera"
      >
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Esperando há
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Contato
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Estado
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Departamento
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Atendente
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-muted-foreground">
                  Ação
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Nenhuma conversa sem resposta no período.
                  </TableCell>
                </TableRow>
              ) : (
                data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="border-border/50 transition-colors hover:bg-accent/30"
                  >
                    <TableCell className="py-2.5">
                      <span className="inline-block rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold tabular-nums text-amber-400">
                        {formatWaiting(item.waitingSeconds)}
                      </span>
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-foreground">
                      {item.contactName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.inboxName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.teamName ?? "—"}
                    </TableCell>
                    <TableCell className="py-2.5 text-sm text-muted-foreground">
                      {item.assigneeName ?? "Sem atendente"}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <OpenInChatwoot
                        accountId={accountId}
                        displayId={item.displayId}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DrillDownSection>
    </div>
  );
}
