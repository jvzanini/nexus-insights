"use client";

import * as React from "react";
import { BarChart3, LineChart as LineChartIcon, PieChart } from "lucide-react";

import { cn } from "@/lib/utils";

export type ChartType = "bar" | "donut";
export type LineBarChartType = "line" | "bar";

export interface ChartTypeToggleProps {
  value: ChartType;
  onChange: (next: ChartType) => void;
  /** Desabilita "donut" se houver muitas categorias. */
  donutDisabled?: boolean;
  donutDisabledHint?: string;
  ariaLabel?: string;
  className?: string;
}

export function ChartTypeToggle({
  value,
  onChange,
  donutDisabled = false,
  donutDisabledHint = "Disponível para ≤ 6 categorias",
  ariaLabel = "Tipo de gráfico",
  className,
}: ChartTypeToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-card/80 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "bar"}
        onClick={() => onChange("bar")}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 cursor-pointer",
          value === "bar"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        aria-label="Gráfico de barras"
      >
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "donut"}
        onClick={() => !donutDisabled && onChange("donut")}
        disabled={donutDisabled}
        title={donutDisabled ? donutDisabledHint : undefined}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200",
          donutDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          value === "donut" && !donutDisabled
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        aria-label="Gráfico de pizza/donut"
      >
        <PieChart className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

export interface ChartLineBarToggleProps {
  value: LineBarChartType;
  onChange: (next: LineBarChartType) => void;
  ariaLabel?: string;
  className?: string;
}

export function ChartLineBarToggle({
  value,
  onChange,
  ariaLabel = "Tipo de gráfico",
  className,
}: ChartLineBarToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-lg border border-border bg-card/80 p-0.5",
        className,
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "line"}
        onClick={() => onChange("line")}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 cursor-pointer",
          value === "line"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        aria-label="Gráfico de linha"
      >
        <LineChartIcon className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "bar"}
        onClick={() => onChange("bar")}
        className={cn(
          "flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 cursor-pointer",
          value === "bar"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(124,58,237,0.3)]"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
        aria-label="Gráfico de barras"
      >
        <BarChart3 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Persiste a preferência por tipo de gráfico no localStorage.
 * Hidrata após mount para manter SSR-friendly.
 */
export function useChartTypeStorage(
  key: string,
  defaultValue: ChartType = "bar",
): [ChartType, (next: ChartType) => void] {
  const [value, setValue] = React.useState<ChartType>(defaultValue);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "bar" || stored === "donut") setValue(stored);
    } catch {
      // localStorage indisponível (SSR/private mode) — mantém default.
    }
  }, [key]);

  const update = React.useCallback(
    (next: ChartType) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignora
      }
    },
    [key],
  );

  return [value, update];
}

export function useLineBarStorage(
  key: string,
  defaultValue: LineBarChartType = "line",
): [LineBarChartType, (next: LineBarChartType) => void] {
  const [value, setValue] = React.useState<LineBarChartType>(defaultValue);

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === "line" || stored === "bar") setValue(stored);
    } catch {
      // ignora
    }
  }, [key]);

  const update = React.useCallback(
    (next: LineBarChartType) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // ignora
      }
    },
    [key],
  );

  return [value, update];
}
