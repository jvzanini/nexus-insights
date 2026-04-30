"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import {
  ChartTooltip,
  type ChartTooltipPayloadItem,
} from "@/components/charts/chart-tooltip";
import { EmptyChartState } from "@/components/charts/empty-chart-state";
import {
  CHART_PALETTE,
  getColorByIndex,
} from "@/lib/charts/colors";
import type { PieChartData } from "@/components/charts/pie-chart";

export interface DonutWithCenterProps {
  data: PieChartData[];
  /** Texto descritivo no centro (ex.: "Total"). */
  centerLabel: string;
  /** Valor formatado no centro (ex.: "1.234"). */
  centerValue: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  showPercentInTooltip?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Callback opcional quando o usuário clica numa fatia.
   * Recebe `name` (label da fatia) e `index` na lista filtrada.
   */
  onSliceClick?: (name: string, index: number) => void;
}

/**
 * Donut chart com texto centralizado no buraco.
 *
 * Caso de uso: dashboards onde o donut representa composição de um total,
 * e o total fica em destaque no centro (ex.: distribuição de status sobre N
 * conversas).
 *
 * - Hover destaca slice ativo (opacity das demais cai para 0.45);
 * - Tooltip rico com %;
 * - Centro sempre legível (texto sobre var(--color-card) implícito);
 * - Empty state explicativo.
 */
export function DonutWithCenter({
  data,
  centerLabel,
  centerValue,
  height = 320,
  innerRadius = 70,
  outerRadius = 110,
  emptyMessage,
  emptyHint,
  formatValue,
  showPercentInTooltip = true,
  className,
  ariaLabel = "Donut chart",
  onSliceClick,
}: DonutWithCenterProps) {
  const prefersReducedMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const filtered = data.filter((d) => Number.isFinite(d.value) && d.value > 0);
  const total = filtered.reduce((acc, d) => acc + d.value, 0);

  if (total <= 0) {
    return (
      <EmptyChartState
        message={emptyMessage ?? "Sem dados para exibir"}
        hint={emptyHint}
        height={height}
        className={className}
      />
    );
  }

  const formatTooltipValue = (v: number) => {
    const base = formatValue
      ? formatValue(v)
      : Number.isFinite(v)
        ? v.toLocaleString("pt-BR")
        : "—";
    if (!showPercentInTooltip) return base;
    const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
    return `${base} (${pct}%)`;
  };

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={{ height, width: "100%", position: "relative" }}
      role="img"
      aria-label={`${ariaLabel}: ${centerLabel} ${centerValue}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip
            content={(props: { active?: boolean; payload?: unknown }) => (
              <ChartTooltip
                active={props.active}
                payload={props.payload as ChartTooltipPayloadItem[] | undefined}
                formatValue={formatTooltipValue}
              />
            )}
          />
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            stroke="var(--color-card)"
            strokeWidth={2}
            isAnimationActive={!prefersReducedMotion}
            animationBegin={0}
            animationDuration={800}
            cursor={onSliceClick ? "pointer" : "default"}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={
              onSliceClick
                ? (_, i) => {
                    const item = filtered[i];
                    if (item) onSliceClick(item.name, i);
                  }
                : undefined
            }
          >
            {filtered.map((entry, i) => (
              <Cell
                key={`${entry.name}-${i}`}
                fill={
                  entry.color ??
                  CHART_PALETTE[i] ??
                  getColorByIndex(i)
                }
                opacity={
                  activeIndex === null || activeIndex === i ? 1 : 0.45
                }
                style={{ transition: "opacity 200ms ease" }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {centerValue}
        </span>
        <span className="max-w-[60%] text-xs uppercase tracking-wide text-muted-foreground">
          {centerLabel}
        </span>
      </div>
    </motion.div>
  );
}
