"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartTooltip,
  type ChartTooltipPayloadItem,
} from "@/components/charts/chart-tooltip";
import { EmptyChartState } from "@/components/charts/empty-chart-state";
import { getColorByIndex } from "@/lib/charts/colors";

export interface BarChartData {
  name: string;
  [key: string]: string | number;
}

export interface BarChartSeries {
  key: string;
  label: string;
  color?: string;
}

export interface InteractiveBarChartProps {
  data: BarChartData[];
  series: BarChartSeries[];
  height?: number;
  /**
   * Layout do chart:
   * - "vertical" (default): barras sobem (XAxis = name, YAxis = value);
   * - "horizontal": barras crescem para a direita (YAxis = name, XAxis = value).
   */
  layout?: "vertical" | "horizontal";
  stacked?: boolean;
  showLegend?: boolean;
  showGrid?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  className?: string;
  ariaLabel?: string;
  /**
   * Largura mínima reservada ao YAxis quando layout="horizontal".
   * Ajuste se as labels forem longas.
   */
  yAxisWidth?: number;
  /**
   * Callback disparado ao clicar numa barra. Recebe o `name` da categoria
   * (eixo categórico) e o `seriesKey` clicado.
   */
  onBarClick?: (name: string, seriesKey: string) => void;
  /**
   * Quando definido, sobrescreve o tickFormatter do eixo numérico para
   * formato monetário com 2 casas (locale-aware). Não afeta o tooltip.
   */
  yAxisCurrency?: "USD" | "BRL";
  /**
   * Tamanho da fonte dos ticks do eixo X (default 13).
   */
  xAxisFontSize?: number;
  /**
   * Margem entre os ticks e o eixo X — aplicado como `tickMargin` (default 12).
   */
  xAxisPadding?: number;
}

const defaultFormat = (v: number) =>
  Number.isFinite(v) ? v.toLocaleString("pt-BR") : "—";

function makeYAxisFormatter(
  currency: "USD" | "BRL" | undefined,
  fallback: (v: number) => string,
): (v: number) => string {
  if (currency === "BRL") {
    const fmt = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v) => (Number.isFinite(v) ? fmt.format(v) : "—");
  }
  if (currency === "USD") {
    const fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (v) => (Number.isFinite(v) ? fmt.format(v) : "—");
  }
  return fallback;
}

/**
 * Bar chart interativo (vertical/horizontal, agrupado/empilhado) com:
 * - animação Recharts 800ms + Framer Motion fade/scale 200ms;
 * - hover: outras séries reduzidas a opacity 0.45;
 * - tooltip rico via ChartTooltip;
 * - grid sutil (sem competir com dados);
 * - empty state explicativo;
 * - prefers-reduced-motion respeitado.
 */
export function InteractiveBarChart({
  data,
  series,
  height = 320,
  layout = "vertical",
  stacked = false,
  showLegend = true,
  showGrid = true,
  emptyMessage,
  emptyHint,
  formatValue = defaultFormat,
  className,
  ariaLabel = "Gráfico de barras",
  yAxisWidth = 80,
  onBarClick,
  yAxisCurrency,
  xAxisFontSize = 13,
  xAxisPadding = 12,
}: InteractiveBarChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const numericTickFormatter = makeYAxisFormatter(yAxisCurrency, formatValue);

  const hasData =
    data.length > 0 &&
    series.length > 0 &&
    data.some((row) =>
      series.some((s) => {
        const v = row[s.key];
        return typeof v === "number" && Number.isFinite(v) && v > 0;
      }),
    );

  if (!hasData) {
    return (
      <EmptyChartState
        message={emptyMessage ?? "Sem dados para exibir"}
        hint={emptyHint}
        height={height}
        className={className}
      />
    );
  }

  const isHorizontal = layout === "horizontal";

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
        >
          {showGrid ? (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted/40"
              horizontal={!isHorizontal}
              vertical={isHorizontal}
            />
          ) : null}
          {isHorizontal ? (
            <>
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                allowDecimals={yAxisCurrency !== undefined}
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: xAxisFontSize }}
                fontSize={xAxisFontSize}
                tickMargin={xAxisPadding}
                tickFormatter={(v) => numericTickFormatter(Number(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                width={yAxisWidth}
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: 13 }}
                fontSize={13}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: xAxisFontSize }}
                fontSize={xAxisFontSize}
                tickMargin={xAxisPadding}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                stroke="currentColor"
                allowDecimals={yAxisCurrency !== undefined}
                className="text-xs text-muted-foreground"
                tick={{ fill: "currentColor", fontSize: 13 }}
                fontSize={13}
                width={yAxisCurrency ? 72 : 48}
                tickFormatter={(v) => numericTickFormatter(Number(v))}
              />
            </>
          )}
          <Tooltip
            cursor={{ fill: "currentColor", fillOpacity: 0.06 }}
            content={(props: {
              active?: boolean;
              payload?: unknown;
              label?: unknown;
            }) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                label={String(props.label ?? "")}
                formatValue={formatValue}
              />
            )}
          />
          {showLegend && series.length > 1 ? (
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
              onMouseEnter={(e) => {
                const k = (e as { dataKey?: string }).dataKey;
                if (k) setActiveKey(k);
              }}
              onMouseLeave={() => setActiveKey(null)}
            />
          ) : null}
          {series.map((s, i) => {
            const color = s.color ?? getColorByIndex(i);
            const dim = activeKey !== null && activeKey !== s.key;
            return (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={color}
                stackId={stacked ? "stack" : undefined}
                radius={stacked ? 0 : 6}
                fillOpacity={dim ? 0.4 : 1}
                isAnimationActive={!prefersReducedMotion}
                animationBegin={0}
                animationDuration={800}
                style={{
                  transition: "fill-opacity 200ms ease",
                  cursor: onBarClick ? "pointer" : "default",
                }}
                onMouseEnter={() => setActiveKey(s.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={
                  onBarClick
                    ? (entry) => {
                        const payload = entry as { payload?: { name?: string } };
                        const name = payload.payload?.name;
                        if (typeof name === "string") onBarClick(name, s.key);
                      }
                    : undefined
                }
              />
            );
          })}
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
