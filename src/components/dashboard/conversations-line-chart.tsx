"use client";

import { LineChart as LineChartIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts/types/component/Tooltip";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartLineBarToggle,
  useLineBarStorage,
} from "./chart-type-toggle";
import { formatBucketLabel } from "@/lib/utils/format-bucket";
import type { DashboardChartPoint } from "@/lib/chatwoot/queries/dashboard-data";

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  /** Timezone da plataforma — passada server→client para render coerente. */
  tz: string;
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

const STORAGE_KEY = "dashboard.chartType.conversations";

export function ConversationsLineChart({
  data,
  granularity,
  tz,
}: ConversationsLineChartProps) {
  const [type, setType] = useLineBarStorage(STORAGE_KEY, "line");
  const title =
    granularity === "hour" ? "Conversas por hora" : "Conversas por dia";

  const chartData = data.map((point) => ({
    label: formatBucketLabel(point.bucket, granularity, tz),
    Recebidas: point.received,
    Resolvidas: point.resolved,
  }));

  const isEmpty = data.every((p) => p.received === 0 && p.resolved === 0);

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
        <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
          <LineChartIcon className="h-4 w-4 text-violet-400" />
          {title}
        </CardTitle>
        <ChartLineBarToggle value={type} onChange={setType} />
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            Nenhuma conversa no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            {type === "line" ? (
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
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
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
            ) : (
              <BarChart data={chartData}>
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
                  cursor={{ fill: "rgba(63, 63, 70, 0.2)" }}
                />
                <Legend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                />
                <Bar
                  dataKey="Recebidas"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="Resolvidas"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
