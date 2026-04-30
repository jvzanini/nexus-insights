"use client";

import { PieChart as PieChartIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutWithCenter } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
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
            <span className="mt-1 text-xs font-normal text-muted-foreground">
              Conversas criadas no período
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DonutWithCenter
          data={slices}
          centerLabel="Total"
          centerValue={total.toLocaleString("pt-BR")}
          height={300}
          emptyMessage="Sem conversas no período"
          onSliceClick={(name) => {
            const found = data.find((item) => item.label === name);
            if (found) onSelect(found.status);
          }}
        />
      </CardContent>
    </Card>
  );
}
