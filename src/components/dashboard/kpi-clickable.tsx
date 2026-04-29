// Server Component — não pode ter "use client" porque recebe LucideIcon
// (function) como prop direto da page.tsx (Server Component).

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type KpiClickableVariant =
  | "neutral"
  | "warning"
  | "success"
  | "urgent";

export type KpiClickableBadge = "agora" | "no período";

export interface KpiClickableProps {
  title: string;
  value: number;
  icon: LucideIcon;
  href: string;
  variant?: KpiClickableVariant;
  badge?: KpiClickableBadge;
  ariaLabel?: string;
}

const numberFormatter = new Intl.NumberFormat("pt-BR");

const variantTokens: Record<
  KpiClickableVariant,
  {
    iconBg: string;
    iconColor: string;
    valueColor: string;
    badgeBg: string;
    badgeColor: string;
    ring: string;
  }
> = {
  neutral: {
    iconBg: "bg-slate-500/10",
    iconColor: "text-slate-300",
    valueColor: "text-foreground",
    badgeBg: "bg-slate-500/15",
    badgeColor: "text-slate-300",
    ring: "hover:ring-2 hover:ring-slate-400/30",
  },
  warning: {
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400",
    valueColor: "text-amber-300",
    badgeBg: "bg-amber-500/15",
    badgeColor: "text-amber-300",
    ring: "hover:ring-2 hover:ring-amber-400/30",
  },
  success: {
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400",
    valueColor: "text-emerald-300",
    badgeBg: "bg-emerald-500/15",
    badgeColor: "text-emerald-300",
    ring: "hover:ring-2 hover:ring-emerald-400/30",
  },
  urgent: {
    iconBg: "bg-red-500/10",
    iconColor: "text-red-400",
    valueColor: "text-red-300",
    badgeBg: "bg-red-500/15",
    badgeColor: "text-red-300",
    ring: "hover:ring-2 hover:ring-red-400/30",
  },
};

export function KpiClickable({
  title,
  value,
  icon: Icon,
  href,
  variant = "neutral",
  badge,
  ariaLabel,
}: KpiClickableProps) {
  const tokens = variantTokens[variant];
  const formatted = numberFormatter.format(value);
  const computedAriaLabel =
    ariaLabel ??
    `${title}: ${formatted}${badge ? `, ${badge}` : ""}. Abrir detalhes.`;

  return (
    <Link
      href={href}
      aria-label={computedAriaLabel}
      className={cn(
        "group relative flex h-32 flex-col justify-between rounded-2xl border border-border bg-muted/30 p-5",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:bg-accent/30 hover:border-foreground/20",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        tokens.ring,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            tokens.iconBg,
          )}
          aria-hidden="true"
        >
          <Icon className={cn("h-5 w-5", tokens.iconColor)} />
        </div>
        <div className="flex items-center gap-2">
          {badge ? (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                tokens.badgeBg,
                tokens.badgeColor,
              )}
            >
              {badge}
            </span>
          ) : null}
          <ArrowUpRight
            className={cn(
              "h-4 w-4 text-muted-foreground/60",
              "transition-all duration-200",
              "group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
            )}
            aria-hidden="true"
          />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p
          className={cn(
            "mt-1 text-3xl font-bold tracking-tight tabular-nums",
            tokens.valueColor,
          )}
        >
          {formatted}
        </p>
      </div>
    </Link>
  );
}
