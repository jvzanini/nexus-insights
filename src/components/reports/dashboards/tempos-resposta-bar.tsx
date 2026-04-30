"use client";

import { InteractiveBarChart, type BarChartData } from "@/components/charts";
import { CHART_COLORS } from "@/lib/charts/colors";
import { formatDuration } from "@/lib/utils/format-time";

export interface TemposRespostaBarRow extends BarChartData {
  name: string;
  Total: number;
  "Hor. comercial": number;
}

interface TemposRespostaBarProps {
  data: TemposRespostaBarRow[];
}

/**
 * Wrapper Client do bar chart de Tempos de Resposta.
 *
 * Necessário porque o Server Component pai não pode passar `formatValue`
 * (uma função) diretamente para um Client Component (`InteractiveBarChart`).
 * Aqui criamos a função localmente, no client, e mantemos a UI idêntica.
 */
export function TemposRespostaBar({ data }: TemposRespostaBarProps) {
  return (
    <InteractiveBarChart
      data={data}
      series={[
        { key: "Total", label: "Total", color: CHART_COLORS.violet },
        {
          key: "Hor. comercial",
          label: "Hor. comercial",
          color: CHART_COLORS.emerald,
        },
      ]}
      height={260}
      formatValue={(v) => formatDuration(v)}
      ariaLabel="Tempos médios: total vs horário comercial"
    />
  );
}
