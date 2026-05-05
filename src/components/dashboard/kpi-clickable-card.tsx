"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface KpiTrend {
  direction: "up" | "down" | "flat";
  /** Texto pronto para exibir (ex.: "+12,3%", "-1,8pp"). */
  value: string;
  /** Quando true, "up" é negativo (ex.: tempo de resposta). */
  invert?: boolean;
}

export interface KpiClickableCardProps {
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  label: string;
  /** @deprecated use `subtitle`. Mantido por compat. */
  sublabel?: string;
  subtitle?: string;
  value: string;
  trend?: KpiTrend | null;
  badge?: string;
  miniChart?: React.ReactNode;
  onClick: () => void;
  /**
   * Aria-label completo. Default = `${label}: ${value}`.
   */
  ariaLabel?: string;
  className?: string;
}

/**
 * Card pequeno e clicável para KPIs do dashboard. Abre drill-down ao clicar.
 *
 * Layout (v0.22.0 — alinhado ao KpiCard de /agente-nex/consumo):
 * - Linha 1: label UPPERCASE pequeno (esq.) + badge (opc.) + ícone top-right.
 * - Linha 2 (hover): hint "ver detalhes" alinhado à direita.
 * - Linha 3: valor 3xl bold tabular-nums.
 * - Linha 4 (opcional): trend com cor up/down/flat.
 * - Linha 5 (opcional): subtitle muted (fallback para legacy `sublabel`).
 * - Linha 6 (opcional): sparkline.
 *
 * Acessibilidade & motion:
 * - Touch target generoso (>= 44px) cumprido pelo card inteiro.
 * - Hover: ring violeta sutil + leve scale (1.01) + cursor pointer.
 * - Press: scale 0.98 (cumpre `scale-feedback`).
 * - Foco visível: ring 2px violeta (cumpre `focus-states`).
 * - Espaço reservado para sparkline (cumpre `content-jumping`).
 * - Suporta motion-reduce automaticamente via Framer Motion.
 * - Renderizado como `<button>` para ter:
 *    - keyboard activation (Enter/Space) nativa,
 *    - role implícito,
 *    - cumprir `keyboard-nav` e `focusable-elements`.
 */
export function KpiClickableCard({
  icon: Icon,
  iconColor = "text-violet-400",
  iconBg = "bg-violet-500/10",
  label,
  sublabel,
  subtitle,
  value,
  trend,
  badge,
  miniChart,
  onClick,
  ariaLabel,
  className,
}: KpiClickableCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const effectiveSubtitle = subtitle ?? sublabel;

  const trendIsGood =
    trend && trend.direction !== "flat"
      ? trend.invert
        ? trend.direction === "down"
        : trend.direction === "up"
      : false;
  const trendIsBad =
    trend && trend.direction !== "flat"
      ? trend.invert
        ? trend.direction === "up"
        : trend.direction === "down"
      : false;

  const trendClass = trendIsGood
    ? "text-emerald-400"
    : trendIsBad
      ? "text-red-400"
      : "text-muted-foreground";

  const TrendIcon =
    trend?.direction === "up"
      ? ArrowUpRight
      : trend?.direction === "down"
        ? ArrowDownRight
        : ArrowRight;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={prefersReducedMotion ? undefined : { scale: 1.01 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      aria-label={
        ariaLabel ??
        `${label}: ${value}.${effectiveSubtitle ? ` ${effectiveSubtitle}.` : ""} Clique para ver detalhes.`
      }
      className={cn(
        "group relative flex w-full flex-col rounded-xl border border-border bg-card p-5 text-left",
        "min-h-[8rem] cursor-pointer outline-none",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-violet-500/30 hover:shadow-lg hover:shadow-violet-500/5",
        "focus-visible:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "motion-reduce:transition-none",
        className,
      )}
    >
      {/* Linha topo: label (esq.) + badge + ícone (top-right) */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
        </div>
        <div className="flex items-start gap-2">
          {badge ? (
            <Badge
              variant="outline"
              className="border-border text-xs text-muted-foreground"
            >
              {badge}
            </Badge>
          ) : null}
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              iconBg,
            )}
          >
            <Icon className={cn("h-5 w-5", iconColor)} aria-hidden />
          </div>
        </div>
      </div>

      {/* Hint "ver detalhes" — discreto, alinhado à direita, abaixo da linha topo */}
      <span
        aria-hidden
        className="mt-1 self-end inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-violet-400/80 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        ver detalhes
        <ArrowRight className="h-3 w-3" />
      </span>

      {/* Valor + trend + subtitle */}
      <div className="mt-3">
        <p className="font-heading text-3xl font-bold tracking-tight tabular-nums text-foreground">
          {value}
        </p>
        {trend ? (
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1 text-xs font-medium",
              trendClass,
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" aria-hidden />
            {trend.value}
          </p>
        ) : null}
        {effectiveSubtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground/80">
            {effectiveSubtitle}
          </p>
        ) : null}
      </div>

      {/* Sparkline — ocupa o final do card sem competir com texto */}
      {miniChart ? (
        <div
          aria-hidden
          className="mt-3 -mx-1 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
        >
          {miniChart}
        </div>
      ) : null}
    </motion.button>
  );
}
