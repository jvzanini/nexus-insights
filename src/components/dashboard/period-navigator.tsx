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
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border bg-card/80 px-0.5 py-0.5",
        "border-violet-500/40 transition-colors duration-150",
        "hover:border-violet-500/70 hover:bg-violet-500/5",
        "focus-within:border-violet-500 focus-within:shadow-[0_0_0_2px_rgba(139,92,246,0.2)]",
      )}
      role="group"
      aria-label={`Navegação de ${period}`}
    >
      <button
        type="button"
        onClick={handlePrev}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded transition-colors duration-150",
          "text-violet-300 hover:bg-violet-500/15 hover:text-violet-200 cursor-pointer",
          "focus-visible:outline-none focus-visible:bg-violet-500/20",
        )}
        aria-label="Período anterior"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span className="px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground select-none whitespace-nowrap">
        {label}
      </span>
      <button
        type="button"
        onClick={handleNext}
        disabled={!nextAvailable}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded transition-colors duration-150",
          nextAvailable
            ? "text-violet-300 hover:bg-violet-500/15 hover:text-violet-200 cursor-pointer focus-visible:outline-none focus-visible:bg-violet-500/20"
            : "text-violet-300/20 cursor-not-allowed",
        )}
        aria-label="Próximo período"
      >
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
