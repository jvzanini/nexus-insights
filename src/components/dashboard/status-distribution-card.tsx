"use client";

import { ChevronRight, MousePointerClick, PieChart as PieChartIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutWithCenter } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import { cn } from "@/lib/utils";
import type {
  DashboardByStatus,
  DashboardStatusCode,
} from "@/lib/chatwoot/queries/dashboard-data";

export interface StatusDistributionCardProps {
  data: DashboardByStatus[];
  onSelect: (status: DashboardStatusCode) => void;
}

const STATUS_COLORS: Record<DashboardStatusCode, string> = {
  0: CHART_COLORS.amber, // Aberto
  1: CHART_COLORS.emerald, // Resolvido
  2: CHART_COLORS.violet, // Pendente
  3: CHART_COLORS.slate, // Adiado
};

export function StatusDistributionCard({
  data,
  onSelect,
}: StatusDistributionCardProps) {
  const total = data.reduce((acc, item) => acc + item.count, 0);

  const slices = data
    .filter((item) => item.count > 0)
    .map((item) => ({
      name: item.label,
      value: item.count,
      color: STATUS_COLORS[item.status],
    }));

  return (
    <Card className="h-full bg-card border border-border rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10"
            aria-hidden="true"
          >
            <PieChartIcon className="h-4 w-4 text-violet-400" />
          </span>
          <span className="flex flex-col">
            <span className="leading-none">Distribuição por status</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" aria-hidden="true" />
              Clique num status para ver as conversas
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Donut compacto à esquerda */}
          <div className="w-full max-w-[220px] shrink-0">
            <DonutWithCenter
              data={slices}
              centerLabel="Total"
              centerValue={total.toLocaleString("pt-BR")}
              height={220}
              innerRadius={56}
              outerRadius={88}
              emptyMessage="Sem conversas no período"
              onSliceClick={(name) => {
                const found = data.find((item) => item.label === name);
                if (found) onSelect(found.status);
              }}
            />
          </div>

          {/* Legenda + contagens clicáveis à direita */}
          <ul
            className="flex w-full flex-1 flex-col gap-2"
            aria-label="Conversas por status"
          >
            {data.map((item) => {
              const pct = total > 0 ? (item.count / total) * 100 : 0;
              const isClickable = item.count > 0;
              return (
                <li key={item.status}>
                  <button
                    type="button"
                    disabled={!isClickable}
                    onClick={() => onSelect(item.status)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-left transition-all duration-200",
                      isClickable
                        ? "cursor-pointer hover:border-violet-500/50 hover:bg-accent/30"
                        : "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[item.status] }}
                      aria-hidden="true"
                    />
                    <span className="flex-1 text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                    <span className="shrink-0 rounded-md bg-muted/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                      {item.count.toLocaleString("pt-BR")}
                    </span>
                    {isClickable ? (
                      <ChevronRight
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
