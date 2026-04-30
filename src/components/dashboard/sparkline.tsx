"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  YAxis,
} from "recharts";

import { CHART_COLORS } from "@/lib/charts/colors";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  /** Série numérica (uma só, na ordem cronológica). */
  data: number[];
  /** Cor da linha + fill gradient. Default: violeta primário. */
  color?: string;
  /** Altura em px. Default 32 (segue padrão de KPI cards). */
  height?: number;
  /** Aria label descritivo (cumpre `screen-reader-summary`). */
  ariaLabel?: string;
  className?: string;
}

/**
 * Sparkline minimalista para KPIs (sem axis, sem grid, sem tooltip).
 *
 * - Reserva altura fixa (`content-jumping`) para evitar layout shift;
 * - YAxis presente porém escondido (`hide`) só para forçar autoscale ajustado
 *   à série e impedir achatamento quando há um único pico isolado;
 * - Cumpre `trend-emphasis` (foco no traço, fill discreto via gradient).
 */
export function Sparkline({
  data,
  color = CHART_COLORS.violet,
  height = 36,
  ariaLabel = "Tendência",
  className,
}: SparklineProps) {
  const gradientId = useId();

  // Trata dados vazios / todos zerados como "sem tendência" — placeholder vazio
  // do mesmo height, evitando layout shift.
  const hasData =
    data.length > 1 && data.some((n) => Number.isFinite(n) && n > 0);

  if (!hasData) {
    return (
      <div
        aria-hidden
        className={cn("w-full", className)}
        style={{ height }}
      />
    );
  }

  // Recharts quer uma lista de objetos; um campo `v` basta.
  const chartData = data.map((v, i) => ({ i, v: Number.isFinite(v) ? v : 0 }));

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={cn("w-full", className)}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 2, right: 0, bottom: 2, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            dot={false}
            activeDot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
