"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts";

import { CHART_COLORS } from "@/lib/charts/colors";

export interface InteractiveRadialBarChartProps {
  /** Valor atual (mesma unidade que `max`). */
  value: number;
  /** Valor máximo da escala. Default: 100. */
  max?: number;
  /** Label opcional renderizada acima do valor central. */
  label?: string;
  /** Cor da barra. Default: violet (primária). */
  color?: string;
  /** Diâmetro do chart em px. Default: 200. */
  size?: number;
  /** Sufixo do valor central (ex.: "%"). Default: "%". */
  valueSuffix?: string;
  /** Formatador customizado do valor central (sobrescreve suffix). */
  formatValue?: (v: number, max: number) => string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Radial bar para mostrar progresso/taxa (ex.: SLA compliance, CSAT).
 *
 * - Valor central em destaque (tabular-nums) + label semântico;
 * - Trilha de fundo sutil para indicar "100%" sem competir com o valor;
 * - Animação de entrada respeita prefers-reduced-motion;
 * - role="img" + aria-label para leitores de tela (`screen-reader-summary`).
 */
export function InteractiveRadialBarChart({
  value,
  max = 100,
  label,
  color = CHART_COLORS.violet,
  size = 200,
  valueSuffix = "%",
  formatValue,
  className,
  ariaLabel,
}: InteractiveRadialBarChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const safeMax = max > 0 ? max : 100;
  const safeValue = Math.max(0, Math.min(value, safeMax));
  const display = formatValue
    ? formatValue(safeValue, safeMax)
    : `${Math.round((safeValue / safeMax) * 100)}${valueSuffix}`;

  const data = [
    {
      name: label ?? "valor",
      value: safeValue,
      fill: color,
    },
  ];

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      style={{ width: size, height: size, position: "relative" }}
      role="img"
      aria-label={
        ariaLabel ??
        `${label ?? "Indicador"}: ${display} de ${safeMax}${valueSuffix}`
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          innerRadius="72%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, safeMax]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background={{ fill: "var(--color-muted)", opacity: 0.3 }}
            dataKey="value"
            cornerRadius={999}
            isAnimationActive={!prefersReducedMotion}
            animationBegin={0}
            animationDuration={800}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <span className="text-2xl font-bold tabular-nums text-foreground">
          {display}
        </span>
        {label ? (
          <span className="max-w-[80%] text-xs text-muted-foreground">
            {label}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}
