"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardChartPoint,
} from "@/lib/chatwoot/queries/dashboard-data";

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
}

function formatLabel(iso: string, granularity: "hour" | "day"): string {
  const d = new Date(iso);
  if (granularity === "hour") {
    return d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="text-xs"
          style={{ color: entry.color }}
        >
          {entry.name}:{" "}
          <span className="font-bold">
            {typeof entry.value === "number"
              ? entry.value.toLocaleString("pt-BR")
              : (entry.value ?? "—")}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ConversationsLineChart({
  data,
  granularity,
}: ConversationsLineChartProps) {
  const title =
    granularity === "hour" ? "Conversas por hora" : "Conversas por dia";

  const chartData = data.map((point) => ({
    label: formatLabel(point.bucket, granularity),
    Recebidas: point.received,
    Resolvidas: point.resolved,
  }));

  const isEmpty = data.every((p) => p.received === 0 && p.resolved === 0);

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-violet-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            Nenhuma conversa no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                tick={{ fill: "#71717a", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={CustomTooltip}
                cursor={{ stroke: "rgba(63, 63, 70, 0.5)" }}
              />
              <Line
                type="monotone"
                dataKey="Recebidas"
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="Resolvidas"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
