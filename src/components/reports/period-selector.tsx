"use client";

import { cn } from "@/lib/utils";

export type PeriodKey =
  | "hoje"
  | "ontem"
  | "7d"
  | "30d"
  | "mes_atual"
  | "mes_anterior";

interface Option {
  key: PeriodKey;
  label: string;
}

const OPTIONS: Option[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7d", label: "Últimos 7 dias" },
  { key: "30d", label: "Últimos 30 dias" },
  { key: "mes_atual", label: "Mês atual" },
  { key: "mes_anterior", label: "Mês anterior" },
];

/**
 * Calcula o intervalo {start, end} para uma chave de período.
 * `start` é o início do dia (00:00 local) e `end` é exclusivo (00:00 do dia seguinte ao final).
 * Datas em horário local do servidor (Next.js roda em UTC mas o usuário é pt-BR;
 * isso é aceitável dado que o filter builder usa created_at >= start, < end).
 */
export function getPeriod(key: PeriodKey): { start: Date; end: Date } {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  switch (key) {
    case "hoje":
      return { start: startOfToday, end: endOfToday };
    case "ontem": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 1);
      return { start, end: startOfToday };
    }
    case "7d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 6);
      return { start, end: endOfToday };
    }
    case "30d": {
      const start = new Date(startOfToday);
      start.setDate(start.getDate() - 29);
      return { start, end: endOfToday };
    }
    case "mes_atual": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1,
        0,
        0,
        0,
        0,
      );
      return { start, end };
    }
    case "mes_anterior": {
      const start = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
        0,
        0,
        0,
        0,
      );
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { start, end };
    }
  }
}

interface PeriodSelectorProps {
  value: PeriodKey;
  onChange: (value: PeriodKey) => void;
  className?: string;
}

export function PeriodSelector({
  value,
  onChange,
  className,
}: PeriodSelectorProps) {
  return (
    <div
      className={cn(
        "bg-muted/30 rounded-xl p-1 inline-flex flex-wrap gap-1",
        className,
      )}
      role="tablist"
      aria-label="Período"
    >
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
              active
                ? "bg-background border border-violet-500/30 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const PERIOD_OPTIONS = OPTIONS;
