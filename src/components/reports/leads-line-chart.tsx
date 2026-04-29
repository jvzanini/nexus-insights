"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface LeadsLineChartPoint {
  bucket: string;
  total: number;
}

interface LeadsLineChartProps {
  data: LeadsLineChartPoint[];
  granularity: "day" | "week" | "month";
}

function formatBucket(bucket: string, granularity: "day" | "week" | "month") {
  // bucket vem como YYYY-MM-DD (truncado por dia/semana/mês).
  const d = new Date(`${bucket}T00:00:00`);
  if (Number.isNaN(d.getTime())) return bucket;
  if (granularity === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "short",
      year: "2-digit",
    }).format(d);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

export function LeadsLineChart({ data, granularity }: LeadsLineChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    label: formatBucket(d.bucket, granularity),
  }));

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
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
            cursor={{ stroke: "#7c3aed", strokeOpacity: 0.2 }}
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
              "Leads",
            ]}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ fill: "#7c3aed", r: 3 }}
            activeDot={{ r: 5, fill: "#a78bfa" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
