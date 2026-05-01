"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardPeriod = "dia" | "semana" | "mes";

interface PeriodNavigatorProps {
  period: DashboardPeriod;
  /** Range aplicado pelo backend (ISO strings UTC). */
  range: { start: string; end: string };
  tz: string;
  weekStartsOn: number;
  /** referenceDate atual (null = hoje). */
  referenceDate: string | null;
  /** Backend indica se há período seguinte (range.end < now). */
  nextAvailable: boolean;
  onChange: (referenceDate: string | null) => void;
}

const MONTH_ABBR_PT = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

function formatDayDate(iso: string, tz: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
  }).format(d);
}

function formatMonthYear(iso: string, tz: string): string {
  const d = new Date(iso);
  // Pega mês/ano em tz
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  const yyyy = parts.find((p) => p.type === "year")?.value ?? "";
  const mm = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10);
  const yy = yyyy.slice(-2);
  return `${MONTH_ABBR_PT[mm - 1]}/${yy}`;
}

/**
 * Calcula a referenceDate do período anterior/posterior baseado no period.
 * Retorna ISO string (UTC) que o backend aceita.
 */
function shiftReferenceDate(
  currentReferenceISO: string | null,
  period: DashboardPeriod,
  direction: "prev" | "next",
): string {
  const ref = currentReferenceISO ? new Date(currentReferenceISO) : new Date();
  const next = new Date(ref);
  const sign = direction === "prev" ? -1 : 1;

  if (period === "dia") {
    next.setUTCDate(next.getUTCDate() + sign * 1);
  } else if (period === "semana") {
    next.setUTCDate(next.getUTCDate() + sign * 7);
  } else {
    // mes: avança/volta por calendário
    next.setUTCMonth(next.getUTCMonth() + sign * 1);
  }
  return next.toISOString();
}

export function PeriodNavigator({
  period,
  range,
  tz,
  referenceDate,
  nextAvailable,
  onChange,
}: PeriodNavigatorProps) {
  const label = (() => {
    if (period === "dia") {
      return formatDayDate(range.start, tz);
    }
    if (period === "semana") {
      return `${formatDayDate(range.start, tz)} — ${formatDayDate(range.end, tz)}`;
    }
    return formatMonthYear(range.start, tz);
  })();

  const handlePrev = () => onChange(shiftReferenceDate(referenceDate, period, "prev"));
  const handleNext = () => {
    if (!nextAvailable) return;
    const nextRef = shiftReferenceDate(referenceDate, period, "next");
    // Se shift levou ao período "atual" exato, voltar para null (sinaliza "hoje")
    onChange(nextRef);
  };

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card/80 px-1 py-1"
      role="group"
      aria-label={`Navegação de ${period}`}
    >
      <button
        type="button"
        onClick={handlePrev}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          "text-muted-foreground hover:bg-accent/60 hover:text-foreground cursor-pointer",
        )}
        aria-label="Período anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <span className="px-2 text-sm font-semibold tabular-nums text-foreground select-none">
        {label}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!nextAvailable}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          nextAvailable
            ? "text-muted-foreground hover:bg-accent/60 hover:text-foreground cursor-pointer"
            : "text-muted-foreground/30 cursor-not-allowed",
        )}
        aria-label="Próximo período"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
