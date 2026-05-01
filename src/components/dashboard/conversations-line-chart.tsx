"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { DashboardChartPoint } from "@/lib/chatwoot/queries/dashboard-data";

type SeriesKey = "received" | "open" | "resolved" | "pending";

interface SeriesDef {
  key: SeriesKey;
  label: string;
  color: string;
  /** Texto da legenda no recharts (em pt-BR). */
  rechartsName: string;
}

/**
 * Cores definidas conforme feedback de João (2026-05-01):
 * Recebidas → verde, Abertas → amarelo, Resolvidas → azul, Pendentes → roxo.
 */
const SERIES: readonly SeriesDef[] = [
  { key: "received", label: "Recebidas", color: "#22c55e", rechartsName: "Recebidas" },
  { key: "open", label: "Abertas", color: "#f59e0b", rechartsName: "Abertas" },
  { key: "resolved", label: "Resolvidas", color: "#3b82f6", rechartsName: "Resolvidas" },
  { key: "pending", label: "Pendentes", color: "#8b5cf6", rechartsName: "Pendentes" },
];

const STORAGE_KEY = "dashboard.chart.visibleSeries";
const DEFAULT_VISIBLE: SeriesKey[] = ["received", "open", "resolved", "pending"];

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  /** Timezone da plataforma. */
  tz: string;
  /** Range aplicado pelo backend (ISO strings). Usado para preencher o eixo X. */
  range?: { start: string; end: string };
}

interface ChartRow {
  label: string;
  windowLabel?: string;
  received: number;
  open: number;
  resolved: number;
  pending: number;
}

function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const windowLabel = (payload[0]?.payload as { windowLabel?: string } | undefined)
    ?.windowLabel;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground mb-1">{label}</p>
      {windowLabel ? (
        <p className="text-xs text-muted-foreground/70 mb-2">{windowLabel}</p>
      ) : null}
      {payload.map((entry) => (
        <p
          key={entry.name}
          className="text-xs flex items-center gap-2"
          style={{ color: entry.color }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color as string }}
          />
          <span className="text-foreground">{entry.name}:</span>
          <span className="font-bold tabular-nums">
            {typeof entry.value === "number"
              ? entry.value.toLocaleString("pt-BR")
              : (entry.value ?? "—")}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Gera N entradas vazias entre `start` e `end` em buckets de 1 hora ou 1 dia. */
function generateEmptyBuckets(
  rangeStart: Date,
  rangeEnd: Date,
  granularity: "hour" | "day",
  tz: string,
): Array<{ bucket: string; hourOfDay?: number }> {
  const result: Array<{ bucket: string; hourOfDay?: number }> = [];

  if (granularity === "hour") {
    // 24 horas do dia (00:00..23:00) na tz local
    // dayKey = YYYY-MM-DD do rangeStart na tz
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rangeStart);
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      const localISO = `${dayKey}T${hh}:00:00`;
      const utc = fromZonedTime(localISO, tz);
      result.push({ bucket: utc.toISOString(), hourOfDay: h });
    }
  } else {
    // Dias entre rangeStart e rangeEnd (inclusive das datas locais)
    // Pega o YYYY-MM-DD de cada dia em tz, gera 00:00 local de cada
    const startKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rangeStart);
    const endKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rangeEnd);

    // Loop dia-a-dia (UTC days do startKey até endKey)
    const cur = new Date(`${startKey}T00:00:00Z`);
    const stop = new Date(`${endKey}T00:00:00Z`);
    while (cur.getTime() <= stop.getTime()) {
      const ymd = cur.toISOString().slice(0, 10);
      const utc = fromZonedTime(`${ymd}T00:00:00`, tz);
      result.push({ bucket: utc.toISOString() });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return result;
}

/** Combina data real + buckets vazios. Match por hora-do-dia (granularity=hour) ou dia-do-período (granularity=day). */
function fillBuckets(
  data: DashboardChartPoint[],
  granularity: "hour" | "day",
  tz: string,
  range?: { start: string; end: string },
): ChartRow[] {
  const rangeStart = range ? new Date(range.start) : data[0] ? new Date(data[0].bucket) : new Date();
  const rangeEnd = range ? new Date(range.end) : data[data.length - 1] ? new Date(data[data.length - 1]!.bucket) : new Date();

  const empty = generateEmptyBuckets(rangeStart, rangeEnd, granularity, tz);

  // Index dos buckets reais por hora-do-dia ou YYYY-MM-DD
  const realByKey = new Map<string, DashboardChartPoint>();
  for (const d of data) {
    const dt = new Date(d.bucket);
    const key =
      granularity === "hour"
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            hour: "2-digit",
            hour12: false,
          }).format(dt) // "HH"
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(dt); // YYYY-MM-DD
    realByKey.set(key, d);
  }

  return empty.map((slot) => {
    const slotDt = new Date(slot.bucket);
    const slotKey =
      granularity === "hour"
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            hour: "2-digit",
            hour12: false,
          }).format(slotDt)
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(slotDt);
    const real = realByKey.get(slotKey);
    const label = formatBucketLabel(slot.bucket, granularity, tz);
    const windowLabel =
      granularity === "hour" && typeof slot.hourOfDay === "number"
        ? `Janela: ${String(slot.hourOfDay).padStart(2, "0")}:00 – ${String(slot.hourOfDay).padStart(2, "0")}:59`
        : undefined;
    return {
      label,
      windowLabel,
      received: real?.received ?? 0,
      open: real?.open ?? 0,
      resolved: real?.resolved ?? 0,
      pending: real?.pending ?? 0,
    };
  });
}

export function ConversationsLineChart({
  data,
  granularity,
  tz,
  range,
}: ConversationsLineChartProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleSeries, setVisibleSeries] = useState<SeriesKey[]>(DEFAULT_VISIBLE);

  // Hidrata visibilidade do localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === "string")) {
          const filtered = parsed.filter((k): k is SeriesKey =>
            (DEFAULT_VISIBLE as string[]).includes(k),
          );
          if (filtered.length > 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setVisibleSeries(filtered);
          }
        }
      }
    } catch {
      // ignora
    }
  }, []);

  function toggleSeries(key: SeriesKey) {
    setVisibleSeries((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignora
      }
      return next;
    });
  }

  const title = granularity === "hour" ? "Conversas por hora" : "Conversas por dia";

  const chartData = useMemo(
    () => fillBuckets(data, granularity, tz, range),
    [data, granularity, tz, range],
  );

  const isEmpty = chartData.every(
    (p) => p.received === 0 && p.open === 0 && p.resolved === 0 && p.pending === 0,
  );

  // Largura fixa por bucket: hour=80px, day=64px. Garante respiro nas labels.
  const PX_PER_BUCKET = granularity === "hour" ? 80 : 64;
  const totalWidth = Math.max(640, chartData.length * PX_PER_BUCKET);

  // Centraliza scroll na hora atual (granularity=hour) ou último dia (granularity=day) ao montar
  useEffect(() => {
    if (!scrollRef.current || chartData.length === 0) return;
    const container = scrollRef.current;
    const containerWidth = container.clientWidth;

    let targetIndex = chartData.length - 1;
    if (granularity === "hour") {
      const nowHourStr = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(new Date());
      const nowHour = parseInt(nowHourStr, 10);
      if (Number.isFinite(nowHour)) targetIndex = nowHour;
    }

    const targetX = targetIndex * PX_PER_BUCKET + PX_PER_BUCKET / 2;
    container.scrollLeft = Math.max(0, targetX - containerWidth / 2);
  }, [granularity, tz, chartData.length, PX_PER_BUCKET]);

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-3 flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-violet-400" />
            {title}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione abaixo as séries que deseja ver no gráfico.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {/* Checkboxes de séries */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {SERIES.map((s) => {
            const active = visibleSeries.includes(s.key);
            return (
              <label
                key={s.key}
                className={cn(
                  "inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all duration-150",
                  active
                    ? "border-border bg-card text-foreground"
                    : "border-border/50 bg-card/40 text-muted-foreground hover:text-foreground",
                )}
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleSeries(s.key)}
                  className="sr-only"
                  aria-label={`Mostrar série ${s.label}`}
                />
                <span
                  className={cn(
                    "inline-flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
                  )}
                  style={{
                    borderColor: s.color,
                    backgroundColor: active ? s.color : "transparent",
                  }}
                >
                  {active ? (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <polyline points="2,6 5,9 10,3" />
                    </svg>
                  ) : null}
                </span>
                <span>{s.label}</span>
              </label>
            );
          })}
        </div>

        {isEmpty ? (
          <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">
            Nenhuma conversa no período
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="overflow-x-auto overflow-y-hidden scrollbar-thin"
            tabIndex={0}
            aria-label={
              granularity === "hour"
                ? "Gráfico por hora — intervalo de hora cheia (HH:00 a HH:59), com rolagem horizontal"
                : "Gráfico por dia — rolagem horizontal disponível em períodos longos"
            }
          >
            <div style={{ width: totalWidth, height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 16, right: 24, left: 8, bottom: 16 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#a1a1aa", fontSize: 13 }}
                    tickLine={false}
                    tickMargin={14}
                    axisLine={{ stroke: "#3f3f46" }}
                    interval={0}
                    height={44}
                  />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 13 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={44}
                  />
                  <Tooltip
                    content={CustomTooltip}
                    cursor={{ stroke: "rgba(63, 63, 70, 0.6)" }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    wrapperStyle={{ fontSize: 13, paddingBottom: 8 }}
                    iconType="circle"
                  />
                  {SERIES.filter((s) => visibleSeries.includes(s.key)).map((s) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.rechartsName}
                      stroke={s.color}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
