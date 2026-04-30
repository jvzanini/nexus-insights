"use client";

import { Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InteractiveBarChart,
  InteractivePieChart,
  type BarChartSeries,
  type PieChartData,
} from "@/components/charts";
import { CHART_COLORS, getColorByIndex } from "@/lib/charts/colors";
import {
  ChartTypeToggle,
  useChartTypeStorage,
} from "./chart-type-toggle";
import type { DashboardByTeam } from "@/lib/chatwoot/queries/dashboard-data";

export interface DepartmentDistributionCardProps {
  data: DashboardByTeam[];
  /** Disparado ao clicar numa barra/fatia. id null = bucket "Sem departamento". */
  onSelect: (team: { id: number | null; name: string }) => void;
}

const STORAGE_KEY = "dashboard.chartType.byTeam";
const DONUT_LIMIT = 6;

export function DepartmentDistributionCard({
  data,
  onSelect,
}: DepartmentDistributionCardProps) {
  const [type, setType] = useChartTypeStorage(STORAGE_KEY, "bar");
  const donutDisabled = data.length > DONUT_LIMIT;
  const effectiveType = donutDisabled && type === "donut" ? "bar" : type;

  return (
    <Card className="h-full bg-card border border-border rounded-xl">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10"
            aria-hidden="true"
          >
            <Users className="h-4 w-4 text-emerald-400" />
          </span>
          <span className="flex flex-col">
            <span className="leading-none">Departamentos em aberto</span>
            <span className="mt-1 text-xs font-normal text-muted-foreground">
              Aberto + pendente + adiado, no período
            </span>
          </span>
        </CardTitle>
        <ChartTypeToggle
          value={effectiveType}
          onChange={setType}
          donutDisabled={donutDisabled}
          donutDisabledHint={`Disponível para ≤ ${DONUT_LIMIT} departamentos`}
        />
      </CardHeader>
      <CardContent>
        {effectiveType === "bar" ? (
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
        ) : (
          <InteractivePieChart
            data={data.map<PieChartData>((d, idx) => ({
              name: d.name,
              value: d.count,
              color: getColorByIndex(idx),
            }))}
            innerRadius={64}
            outerRadius={108}
            height={280}
            emptyMessage="Sem conversas em aberto no período"
            onSliceClick={(name) => {
              const found = data.find((d) => d.name === name);
              if (found) onSelect({ id: found.id, name: found.name });
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
