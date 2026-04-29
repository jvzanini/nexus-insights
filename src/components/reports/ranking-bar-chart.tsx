"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RankingBarChartPoint {
  name: string;
  volume: number;
}

interface RankingBarChartProps {
  data: RankingBarChartPoint[];
}

/**
 * Bar chart horizontal (layout="vertical") para ranking.
 * Y-axis recebe nomes; X-axis recebe volume.
 */
export function RankingBarChart({ data }: RankingBarChartProps) {
  // Trunca nomes longos para legibilidade.
  const formatted = data.map((d) => ({
    ...d,
    label: d.name.length > 22 ? `${d.name.slice(0, 20)}…` : d.name,
  }));

  // Altura proporcional ao número de barras (~36px por barra + margem).
  const height = Math.max(220, formatted.length * 36 + 32);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          layout="vertical"
          margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-muted/40"
            horizontal={false}
          />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            allowDecimals={false}
            tick={{ fill: "currentColor", fontSize: 11 }}
            className="text-xs text-muted-foreground"
          />
          <YAxis
            type="category"
            dataKey="label"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            tick={{ fill: "currentColor", fontSize: 11 }}
            width={150}
            className="text-xs text-muted-foreground"
          />
          <Tooltip
            cursor={{ fill: "rgba(124, 58, 237, 0.08)" }}
            contentStyle={{
              background: "rgb(24 24 27)",
              border: "1px solid rgb(63 63 70)",
              borderRadius: 8,
              fontSize: 12,
              color: "rgb(244 244 245)",
            }}
            labelStyle={{ color: "rgb(161 161 170)" }}
            formatter={(value) => [
              Number(value ?? 0).toLocaleString("pt-BR"),
              "Conversas",
            ]}
          />
          <Bar
            dataKey="volume"
            fill="#7c3aed"
            radius={[0, 6, 6, 0]}
            barSize={20}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
