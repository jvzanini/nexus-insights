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

export interface DowBarChartPoint {
  dow: number;
  total: number;
}

const DOW_LABEL = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

interface DowBarChartProps {
  data: DowBarChartPoint[];
}

export function DowBarChart({ data }: DowBarChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: DOW_LABEL[d.dow] ?? String(d.dow),
  }));

  return (
    <div className="h-[300px] w-full">
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
          <Bar dataKey="total" fill="#7c3aed" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
