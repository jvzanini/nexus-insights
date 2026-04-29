"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface StatusPiePoint {
  status: number;
  total: number;
}

const STATUS_META: Record<number, { label: string; color: string }> = {
  0: { label: "Em aberto", color: "#f59e0b" },
  1: { label: "Resolvidas", color: "#10b981" },
  2: { label: "Pendentes", color: "#7c3aed" },
  3: { label: "Adiadas", color: "#71717a" },
};

interface StatusPieChartProps {
  data: StatusPiePoint[];
}

export function StatusPieChart({ data }: StatusPieChartProps) {
  const formatted = data
    .filter((d) => d.total > 0)
    .map((d) => ({
      ...d,
      label: STATUS_META[d.status]?.label ?? `Status ${d.status}`,
      color: STATUS_META[d.status]?.color ?? "#7c3aed",
    }));

  const total = formatted.reduce((acc, x) => acc + x.total, 0);

  if (total === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
        Sem dados para exibir.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip
            contentStyle={{
              background: "rgb(24 24 27)",
              border: "1px solid rgb(63 63 70)",
              borderRadius: 8,
              fontSize: 12,
              color: "rgb(244 244 245)",
            }}
            formatter={(value, _name, payload) => {
              const num = Number(value ?? 0);
              const pct = total > 0 ? ((num / total) * 100).toFixed(1) : "0";
              const label =
                (payload as { payload?: { label?: string } })?.payload?.label ??
                "—";
              return [`${num.toLocaleString("pt-BR")} (${pct}%)`, label];
            }}
          />
          <Pie
            data={formatted}
            dataKey="total"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={110}
            paddingAngle={2}
            stroke="rgb(24 24 27)"
            strokeWidth={2}
          >
            {formatted.map((entry) => (
              <Cell key={entry.status} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
