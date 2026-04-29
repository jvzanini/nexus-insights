import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Top5Item {
  name: string;
  value: string;
  meta?: string;
}

export interface Top5CardProps {
  title: string;
  subtitle?: string;
  items: Top5Item[];
  viewAllHref: string;
  icon: LucideIcon;
  /** Hint sobre onde ler o "valor" (ex.: "tempo", "conversas"). */
  emptyMessage?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Top5Card({
  title,
  subtitle,
  items,
  viewAllHref,
  icon: Icon,
  emptyMessage = "Sem dados no período.",
}: Top5CardProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-muted/30 p-5 transition-colors hover:border-foreground/20">
      <header className="mb-4 flex items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40"
            aria-hidden="true"
          >
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-border/60">
          {items.map((item, idx) => (
            <li
              key={`${item.name}-${idx}`}
              className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <span className="w-4 text-xs font-medium tabular-nums text-muted-foreground">
                {idx + 1}
              </span>
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/15 text-xs font-semibold text-violet-300"
                aria-hidden="true"
              >
                {getInitials(item.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                {item.meta ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.meta}
                  </p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-md bg-muted/40 px-2 py-1",
                  "text-xs font-semibold tabular-nums text-foreground",
                )}
              >
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-4 border-t border-border/60 pt-3">
        <Link
          href={viewAllHref}
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            "text-muted-foreground transition-colors hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "rounded-md",
          )}
          aria-label={`Ver lista completa de ${title.toLowerCase()}`}
        >
          Ver completo
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
