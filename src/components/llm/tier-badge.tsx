import { cn } from "@/lib/utils";

export type CostTier = "free" | "low" | "medium" | "high";

const TIER_CONFIG: Record<CostTier, { symbols: string; title: string; className: string }> = {
  free: {
    symbols: "FREE",
    title: "Gratuito",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  low: {
    symbols: "$",
    title: "Consumo baixo",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300",
  },
  medium: {
    symbols: "$$",
    title: "Consumo médio",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  high: {
    symbols: "$$$",
    title: "Consumo alto",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
};

export function TierBadge({ tier, className }: { tier: CostTier; className?: string }) {
  const cfg = TIER_CONFIG[tier];
  return (
    <span
      title={cfg.title}
      aria-label={cfg.title}
      className={cn(
        "inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
        cfg.className,
        className,
      )}
    >
      {cfg.symbols}
    </span>
  );
}
