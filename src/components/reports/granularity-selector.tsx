"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type Granularity = "day" | "week" | "month";

const OPTIONS: Array<{ key: Granularity; label: string }> = [
  { key: "day", label: "Dia" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mês" },
];

interface GranularitySelectorProps {
  value: Granularity;
  paramKey?: string;
  className?: string;
}

export function GranularitySelector({
  value,
  paramKey = "granularity",
  className,
}: GranularitySelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setValue = (next: Granularity) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "day") {
      sp.delete(paramKey);
    } else {
      sp.set(paramKey, next);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?", { scroll: false });
    });
  };

  return (
    <div
      className={cn(
        "bg-muted/30 rounded-xl p-1 inline-flex gap-1",
        pending && "opacity-80",
        className,
      )}
      role="tablist"
      aria-label="Granularidade"
    >
      {OPTIONS.map((opt) => {
        const active = opt.key === value;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setValue(opt.key)}
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
