"use client";

import { useEffect, useMemo, useState } from "react";
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
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";
import { fromZonedTime } from "date-fns-tz";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBucketLabel } from "@/lib/utils/format-bucket";
import { cn } from "@/lib/utils";
import type { DashboardChartPoint } from "@/lib/chatwoot/queries/dashboard-data";
import { PeriodNavigator } from "./period-navigator";

type SeriesKey = "received" | "open" | "resolved" | "pending";
type DashboardPeriod = "dia" | "semana" | "mes";

interface SeriesDef {
  key: SeriesKey;
  label: string;
  color: string;
}

/**
 * Cores conforme feedback de João (2026-05-01):
 * Novas → verde, Abertas → amarelo, Resolvidas → azul, Pendentes → roxo.
 * Ordem conforme feedback (2026-05-05): novas, pendentes, resolvidas, abertas.
 */
const SERIES: readonly SeriesDef[] = [
  { key: "received", label: "Novas", color: "#22c55e" },
  { key: "pending", label: "Pendentes", color: "#8b5cf6" },
  { key: "resolved", label: "Resolvidas", color: "#3b82f6" },
  { key: "open", label: "Em atendimento", color: "#f59e0b" },
];

const STORAGE_KEY = "dashboard.chart.visibleSeries";
const DEFAULT_VISIBLE: SeriesKey[] = ["received", "open", "resolved", "pending"];

export interface KpiTotals {
  received: number;
  open: number;
  resolved: number;
  pending: number;
}

interface ConversationsLineChartProps {
  data: DashboardChartPoint[];
  granularity: "hour" | "day";
  tz: string;
  range: { start: string; end: string };
  period: DashboardPeriod;
  weekStartsOn: number;
  referenceDate: string | null;
  nextAvailable: boolean;
  onReferenceDateChange: (iso: string | null) => void;
  /** Totais corretos vindos do backend — Novas/Resolvidas=soma de eventos; Abertas/Pendentes=snapshot atual. */
  kpiTotals?: KpiTotals;
}

interface ChartRow {
  label: string;
  windowLabel?: string;
  /** UTC ISO do início do bucket — usado para cortar buckets futuros. */
  bucketIso: string;
  /** true quando o bucket ainda está no futuro (sem dados reais). */
  isFuture?: boolean;
  received: number | null;
  open: number | null;
  resolved: number | null;
  pending: number | null;
}

function CustomTooltip(props: TooltipContentProps<ValueType, NameType>) {
  const { active, payload, label } = props;
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartRow | undefined;
  if (row?.isFuture) return null;
  const windowLabel = row?.windowLabel;
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

/**
 * Gera buckets vazios cobrindo todo o range em granularity definida.
 * Exportado para sanity tests (v0.22.0) — investigação G2 do bug
 * "semana/mês não bate com dia".
 */
export function generateEmptyBuckets(
  rangeStart: Date,
  rangeEnd: Date,
  granularity: "hour" | "day",
  tz: string,
): Array<{ bucket: string; hourOfDay?: number }> {
  const result: Array<{ bucket: string; hourOfDay?: number }> = [];

  if (granularity === "hour") {
    const dayKey = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(rangeStart);
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      const utc = fromZonedTime(`${dayKey}T${hh}:00:00`, tz);
      result.push({ bucket: utc.toISOString(), hourOfDay: h });
    }
    return result;
  }

  // day: dia-a-dia entre rangeStart e rangeEnd
  const startKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(rangeStart);
  // rangeEnd é EXCLUSIVE (próximo 00:00 local). Subtraímos 1ms para obter
  // a data civil do último dia real do período (e.g. 11/05 00:00 BRT → 10/05).
  const endKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(rangeEnd.getTime() - 1));

  const cur = new Date(`${startKey}T00:00:00Z`);
  const stop = new Date(`${endKey}T00:00:00Z`);
  while (cur.getTime() <= stop.getTime()) {
    const ymd = cur.toISOString().slice(0, 10);
    const utc = fromZonedTime(`${ymd}T00:00:00`, tz);
    result.push({ bucket: utc.toISOString() });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return result;
}

/**
 * Transforma uma lista de ChartRow em acumulado progressivo (carry-forward).
 * Se hora 7 tem 5 novas e hora 8 tem 0, hora 8 mantém 5.
 * Exportado para uso nos drill-down charts.
 *
 * ATENÇÃO: assume que os rows não têm isFuture/null nas séries.
 * Deve ser chamado sobre rawChartData (fillBuckets), antes de buildFullPeriodRows.
 * null é tratado como 0 — não reutilize sobre dados que já têm null.
 */
export function toCumulative(rows: ChartRow[]): ChartRow[] {
  let acc = { received: 0, open: 0, resolved: 0, pending: 0 };
  return rows.map((r) => {
    acc = {
      received: acc.received + (r.received ?? 0),
      open: acc.open + (r.open ?? 0),
      resolved: acc.resolved + (r.resolved ?? 0),
      pending: acc.pending + (r.pending ?? 0),
    };
    return { ...r, ...acc };
  });
}

/**
 * Remove buckets cujo início UTC é posterior ao momento atual.
 * Garante que o gráfico não mostre linha plana para dias/horas que ainda não aconteceram.
 * Exportado para uso nos drill-down charts.
 */
export function truncateToNow(rows: ChartRow[]): ChartRow[] {
  const nowIso = new Date().toISOString();
  return rows.filter((r) => r.bucketIso <= nowIso);
}

/**
 * Constrói o array completo do período combinando:
 * - pastRows: buckets passados/presentes com valores acumulados (resultado de truncateToNow(toCumulative(raw)))
 * - allRawBuckets: todos os buckets do período (sem toCumulative, sem truncate)
 *
 * Buckets não presentes em pastRows recebem isFuture=true e séries null,
 * de modo que Recharts não desenhe linha nem exiba tooltip para eles.
 * Exportado para testes e reutilização.
 */
export function buildFullPeriodRows(
  pastRows: ChartRow[],
  allRawBuckets: ChartRow[],
): ChartRow[] {
  const pastLookup = new Map<string, ChartRow>();
  for (const r of pastRows) {
    pastLookup.set(r.bucketIso, r);
  }
  return allRawBuckets.map((bucket) => {
    const past = pastLookup.get(bucket.bucketIso);
    if (past) return past;
    return {
      label: bucket.label,
      windowLabel: bucket.windowLabel,
      bucketIso: bucket.bucketIso,
      isFuture: true,
      received: null,
      open: null,
      resolved: null,
      pending: null,
    };
  });
}

/**
 * Mapeia DashboardChartPoint[] (vindo do backend) em uma linha por bucket
 * cobrindo todo o range. Buckets sem dado real ganham zeros nas 4 séries.
 *
 * Exportado para sanity tests (v0.22.0) — investigação G2 do bug "semana/mês
 * não bate com dia". Hipótese é que matching de bucket key entre SQL e
 * cliente esteja correto; este helper prova isso unitariamente.
 */
export function fillBuckets(
  data: DashboardChartPoint[],
  granularity: "hour" | "day",
  tz: string,
  range: { start: string; end: string },
): ChartRow[] {
  const empty = generateEmptyBuckets(
    new Date(range.start),
    new Date(range.end),
    granularity,
    tz,
  );

  const realByKey = new Map<string, DashboardChartPoint>();
  for (const d of data) {
    const dt = new Date(d.bucket);
    const key =
      granularity === "hour"
        ? new Intl.DateTimeFormat("en-GB", {
            timeZone: tz,
            hour: "2-digit",
            hour12: false,
          }).format(dt)
        : new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(dt);
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
      bucketIso: slot.bucket,
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
  period,
  weekStartsOn,
  referenceDate,
  nextAvailable,
  onReferenceDateChange,
  kpiTotals,
}: ConversationsLineChartProps) {
  const [visibleSeries, setVisibleSeries] = useState<SeriesKey[]>(DEFAULT_VISIBLE);

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

  const rawChartData = useMemo(
    () => fillBuckets(data, granularity, tz, range),
    [data, granularity, tz, range],
  );

  const chartData = useMemo(
    () => buildFullPeriodRows(truncateToNow(toCumulative(rawChartData)), rawChartData),
    [rawChartData],
  );

  const seriesTotals = useMemo(
    () =>
      kpiTotals ?? {
        received: rawChartData.reduce((s, r) => s + (r.received ?? 0), 0),
        open: rawChartData.reduce((s, r) => s + (r.open ?? 0), 0),
        resolved: rawChartData.reduce((s, r) => s + (r.resolved ?? 0), 0),
        pending: rawChartData.reduce((s, r) => s + (r.pending ?? 0), 0),
      },
    [rawChartData, kpiTotals],
  );

  // rawChartData (fillBuckets) sempre usa 0 (nunca null) — não usar chartData aqui
  // pois chartData tem null nos buckets futuros e quebraria a checagem.
  const isEmpty = rawChartData.every(
    (p) => p.received === 0 && p.open === 0 && p.resolved === 0 && p.pending === 0,
  );

  // v0.14.2: TODOS os modos (dia/semana/mês) renderizam full-width sem
  // scroll horizontal. recharts auto-deduplica labels apertados — o tooltip
  // cobre os detalhes de cada bucket.

  return (
    <Card className="bg-card border border-border rounded-xl">
      <CardHeader className="pb-3">
        <div>
          <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-violet-400" />
            {title}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Selecione abaixo as séries que deseja ver no gráfico.
          </p>
        </div>
        <CardAction>
          <PeriodNavigator
            period={period}
            range={range}
            tz={tz}
            weekStartsOn={weekStartsOn}
            referenceDate={referenceDate}
            nextAvailable={nextAvailable}
            onChange={onReferenceDateChange}
          />
        </CardAction>
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
                  className="inline-flex h-4 w-4 items-center justify-center rounded border-2 transition-colors"
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
                <span
                  className="ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums leading-none"
                  style={{
                    backgroundColor: `${s.color}22`,
                    color: s.color,
                  }}
                >
                  {seriesTotals[s.key].toLocaleString("pt-BR")}
                </span>
              </label>
            );
          })}
        </div>

        {isEmpty ? (
          <div className="flex items-center justify-center h-[350px] text-sm text-muted-foreground">
            Nenhuma conversa no período
          </div>
        ) : (
          <div style={{ width: "100%", height: 350 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 16, right: 24, left: 8, bottom: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#a1a1aa", fontSize: 12 }}
                  tickLine={false}
                  tickMargin={12}
                  axisLine={{ stroke: "#3f3f46" }}
                  interval="preserveStartEnd"
                  minTickGap={20}
                  height={40}
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
                {SERIES.filter((s) => visibleSeries.includes(s.key)).map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
