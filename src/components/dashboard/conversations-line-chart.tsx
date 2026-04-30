"use client";

import { useEffect, useRef } from "react";
import { LineChart as LineChartIcon } from "lucide-react";
import {
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
import { fromZonedTime } from "date-fns-tz";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBucketLabel } from "@/lib/utils/format-bucket";
import type { DashboardChartPoint } from "@/lib/chatwoot/queries/dashboard-data";

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  /** Timezone da plataforma — passada server→client para render coerente. */
  tz: string;
}

const HOUR_PIXEL = 64;          // px por hora — desktop
const HOUR_PIXEL_MOBILE = 56;   // px por hora — mobile
const VISIBLE_HOURS_DESKTOP = 12;
const VISIBLE_HOURS_MOBILE = 6;

interface ChartPointWithMeta {
  bucket: string;
  received: number;
  resolved: number;
  hourOfDay?: number;
}

function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const windowLabel = (payload[0]?.payload as { windowLabel?: string } | undefined)
    ?.windowLabel;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {windowLabel ? (
        <p className="text-[11px] text-muted-foreground/70 mb-2">
          Janela: {windowLabel}
        </p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
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

/**
 * Preenche todas as 24 horas do dia com 0/0 quando não há dado.
 *
 * - granularity="hour" + data.length > 0: retorna 24 entradas (00..23).
 * - granularity="day" ou data vazio: retorna data sem mexer.
 *
 * Usa fromZonedTime (date-fns-tz) para construir o ISO de cada hora local
 * no tz da plataforma — sem hack de offset do navegador.
 */
function expandFullDay(
  data: DashboardChartPoint[],
  granularity: "hour" | "day",
  tz: string,
): ChartPointWithMeta[] {
  if (granularity !== "hour" || data.length === 0) {
    return data.map((d) => ({
      bucket: d.bucket,
      received: d.received,
      resolved: d.resolved,
    }));
  }

  const sample = new Date(data[0]!.bucket);
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sample);

  const existingByHour = new Map<number, DashboardChartPoint>();
  for (const d of data) {
    const hourLocal = parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(new Date(d.bucket)),
      10,
    );
    existingByHour.set(hourLocal, d);
  }

  const filled: ChartPointWithMeta[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    const utcDate = fromZonedTime(`${dayKey}T${hh}:00:00`, tz);
    const existing = existingByHour.get(h);

    filled.push({
      bucket: existing?.bucket ?? utcDate.toISOString(),
      received: existing?.received ?? 0,
      resolved: existing?.resolved ?? 0,
      hourOfDay: h,
    });
  }
  return filled;
}

export function ConversationsLineChart({
  data,
  granularity,
  tz,
}: ConversationsLineChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const title =
    granularity === "hour" ? "Conversas por hora" : "Conversas por dia";

  const expanded = expandFullDay(data, granularity, tz);

  const chartData = expanded.map((point) => {
    const label = formatBucketLabel(point.bucket, granularity, tz);
    const windowLabel =
      granularity === "hour" && typeof point.hourOfDay === "number"
        ? `${String(point.hourOfDay).padStart(2, "0")}:00 – ${String(point.hourOfDay).padStart(2, "0")}:59`
        : undefined;
    return {
      label,
      windowLabel,
      Recebidas: point.received,
      Resolvidas: point.resolved,
    };
  });

  const isEmpty = data.every((p) => p.received === 0 && p.resolved === 0);

  // Centralizar scroll na hora atual quando granularity=hour
  useEffect(() => {
    if (granularity !== "hour" || !scrollRef.current) return;
    const nowHour = parseInt(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
      10,
    );
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    const px = isMobile ? HOUR_PIXEL_MOBILE : HOUR_PIXEL;
    const visible = isMobile ? VISIBLE_HOURS_MOBILE : VISIBLE_HOURS_DESKTOP;
    const scrollLeft = Math.max(0, (nowHour - Math.floor(visible / 2)) * px);
    scrollRef.current.scrollLeft = scrollLeft;
  }, [granularity, tz, chartData.length]);

  const totalPxDesktop = chartData.length * HOUR_PIXEL;

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-2 flex-row items-start justify-between gap-3">
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
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden"
            tabIndex={0}
            aria-label={
              granularity === "hour"
                ? "Gráfico por hora — intervalo de hora cheia (HH:00 a HH:59), com rolagem horizontal"
                : "Gráfico por dia"
            }
          >
            <div
              style={{
                width: granularity === "hour" ? totalPxDesktop : "100%",
                minWidth: "100%",
              }}
            >
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                    tickMargin={12}
                    axisLine={{ stroke: "#27272a" }}
                    interval={granularity === "hour" ? 0 : "preserveStartEnd"}
                    height={36}
                  />
                  <YAxis
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={36}
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
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
