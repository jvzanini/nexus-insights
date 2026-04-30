"use client";

// QuickFiltersPopover — botão "Atalhos" com 3 toggles operacionais (Sem
// resposta, Não atribuídas, Minhas). Compõe AND com o conditionGroup do
// modo Avançado em runtime. Não persiste; é estado da sessão.

import { useState } from "react";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  QUICK_FILTER_DEFS,
  type QuickFilterKey,
} from "@/lib/reports/quick-filters";

interface Props {
  active: Set<QuickFilterKey>;
  onToggle: (key: QuickFilterKey) => void;
  /** Se null, atalho "Minhas" fica oculto (sem mapping User → Chatwoot). */
  currentChatwootUserId: number | null;
}

export function QuickFiltersPopover({
  active,
  onToggle,
  currentChatwootUserId,
}: Props) {
  const [open, setOpen] = useState(false);
  const visibleDefs = QUICK_FILTER_DEFS.filter(
    (d) => d.key !== "mine" || currentChatwootUserId != null,
  );
  const count = visibleDefs.filter((d) => active.has(d.key)).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Atalhos rápidos${
              count > 0 ? ` (${count} ativos)` : ""
            }`}
            data-tour="quick-filters"
            className={cn(
              "relative h-10 px-4",
              count > 0 && "border-violet-500/40 text-foreground",
            )}
          >
            <Zap aria-hidden="true" />
            Atalhos
            {count > 0 ? (
              <Badge
                variant="default"
                className="ml-1 h-5 min-w-5 px-1.5 tabular-nums"
              >
                {count}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="start" sideOffset={8} className="w-72 p-0">
        <div className="border-b border-border/60 px-3 py-2">
          <span className="text-xs font-semibold text-muted-foreground">
            Atalhos rápidos
          </span>
        </div>
        <ul
          role="listbox"
          aria-label="Atalhos rápidos"
          aria-multiselectable="true"
          className="py-1"
        >
          {visibleDefs.map((def) => {
            const checked = active.has(def.key);
            return (
              <li key={def.key} role="option" aria-selected={checked}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                    checked && "bg-accent/40",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => onToggle(def.key)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">
                      {def.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {def.description}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export default QuickFiltersPopover;
