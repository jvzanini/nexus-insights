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

export interface DepartamentoBarChartPoint {
  name: string;
  volume: number;
}

interface DepartamentoBarChartProps {
  data: DepartamentoBarChartPoint[];
}

export function DepartamentoBarChart({ data }: DepartamentoBarChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: d.name.length > 14 ? `${d.name.slice(0, 12)}…` : d.name,
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={formatted}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            className="stroke-muted/40"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 11 }}
            interval={0}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            stroke="currentColor"
            allowDecimals={false}
            className="text-xs text-muted-foreground"
            tick={{ fill: "currentColor", fontSize: 11 }}
            width={36}
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
          <Bar dataKey="volume" fill="#7c3aed" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
