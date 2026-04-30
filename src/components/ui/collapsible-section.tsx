"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * CollapsibleSection — wrapper colapsável com header padronizado.
 *
 * Header: ícone opcional + título + count badge (quando > 0) + chevron animado.
 * Begin colapsado por default; toggle ao clicar; `aria-expanded` reflete estado.
 * Mantém ritmo 4/8dp e radius compatível com cards do design system.
 */

interface Props {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export function CollapsibleSection({
  title,
  count = 0,
  defaultOpen = false,
  icon,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border/60 bg-background/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground transition-colors",
          "hover:bg-muted/40",
        )}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        {count > 0 ? (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
            {count}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="border-t border-border/60 p-3">{children}</div>
      ) : null}
    </div>
  );
}
