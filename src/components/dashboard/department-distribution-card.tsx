"use client";

import { MousePointerClick, Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InteractiveBarChart,
  type BarChartSeries,
} from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import type { DashboardByTeam } from "@/lib/chatwoot/queries/dashboard-data";

export interface DepartmentDistributionCardProps {
  data: DashboardByTeam[];
  /** Disparado ao clicar numa barra. id null = bucket "Sem departamento". */
  onSelect: (team: { id: number | null; name: string }) => void;
}

export function DepartmentDistributionCard({
  data,
  onSelect,
}: DepartmentDistributionCardProps) {
  return (
    <Card className="h-full bg-card border border-border rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10"
            aria-hidden="true"
          >
            <Users className="h-4 w-4 text-emerald-400" />
          </span>
          <span className="flex flex-col">
            <span className="leading-none">Departamentos em aberto</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
              <MousePointerClick className="h-3 w-3" aria-hidden="true" />
              Clique numa barra para ver as conversas
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <InteractiveBarChart
          data={data.map((d) => ({ name: d.name, Conversas: d.count }))}
          series={[
            {
              key: "Conversas",
              label: "Conversas",
              color: CHART_COLORS.emerald,
            } satisfies BarChartSeries,
          ]}
          layout="horizontal"
          height={Math.max(220, data.length * 36 + 40)}
          showLegend={false}
          yAxisWidth={140}
          emptyMessage="Sem conversas em aberto no período"
          onBarClick={(name) => {
            const found = data.find((d) => d.name === name);
            if (found) onSelect({ id: found.id, name: found.name });
          }}
        />
      </CardContent>
    </Card>
  );
}
