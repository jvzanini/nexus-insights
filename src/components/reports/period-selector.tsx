"use client";

import { cn } from "@/lib/utils";
import {
  type PeriodKey,
  PERIOD_OPTIONS as OPTIONS,
} from "@/lib/reports/period";
export { type PeriodKey, getPeriod } from "@/lib/reports/period";

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
