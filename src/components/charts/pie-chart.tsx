"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import {
  Cell,
  Legend,
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
import { CHART_PALETTE, getColorByIndex } from "@/lib/charts/colors";

export interface PieChartData {
  name: string;
  value: number;
  color?: string;
}

export interface InteractivePieChartProps {
  data: PieChartData[];
  height?: number;
  /** 0 = pie cheio; > 0 = donut. Default: 0. */
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  emptyMessage?: string;
  emptyHint?: string;
  formatValue?: (v: number) => string;
  /**
   * Quando true, exibe o percentual ao lado do valor no tooltip.
   * Default: true.
   */
  showPercentInTooltip?: boolean;
  className?: string;
  ariaLabel?: string;
  /**
   * Callback disparado ao clicar numa fatia. Recebe o `name` (label) e o
   * índice na lista filtrada.
   */
  onSliceClick?: (name: string, index: number) => void;
}

/**
 * Pie/Donut chart interativo com:
 * - animação de entrada (Recharts 800ms + Framer Motion fade/scale 200ms);
 * - hover dim: slices não-ativos caem para opacity 0.45;
 * - tooltip rico (label + valor + %);
 * - legend acessível (centro inferior, scroll em mobile via wrapperStyle);
 * - empty state explicativo;
 * - respeito a prefers-reduced-motion.
 */
export function InteractivePieChart({
  data,
  height = 320,
  innerRadius = 0,
  outerRadius,
  showLegend = true,
  emptyMessage,
  emptyHint,
  formatValue,
  showPercentInTooltip = true,
  className,
  ariaLabel = "Gráfico de pizza",
  onSliceClick,
}: InteractivePieChartProps) {
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
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
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
          {showLegend ? (
            <Legend
              verticalAlign="bottom"
              align="center"
              iconType="circle"
              wrapperStyle={{
                fontSize: 12,
                paddingTop: 8,
                lineHeight: "1.5rem",
              }}
            />
          ) : null}
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius ?? 110}
            paddingAngle={innerRadius > 0 ? 2 : 1}
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
                fill={entry.color ?? CHART_PALETTE[i] ?? getColorByIndex(i)}
                opacity={activeIndex === null || activeIndex === i ? 1 : 0.45}
                style={{ transition: "opacity 200ms ease" }}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
