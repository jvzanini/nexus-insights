import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "danger" | "success" | "warning";
}

const toneIconColor: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-violet-400",
  danger: "text-red-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
};

const toneBgColor: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "bg-violet-600/10",
  danger: "bg-red-500/10",
  success: "bg-emerald-500/10",
  warning: "bg-amber-500/10",
};

export function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: KpiCardProps) {
  return (
    <div className="group relative rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-2",
            toneBgColor[tone],
          )}
        >
          <Icon className={cn("h-5 w-5", toneIconColor[tone])} />
        </div>
      </div>
    </div>
  );
}
