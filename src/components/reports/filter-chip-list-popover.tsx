"use client";

import { useState } from "react";
import { ChevronDown, X } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ResolvedItem {
  id: number;
  name: string;
}

interface FilterChipListPopoverProps {
  /** Texto principal (ex: "Caixa de entrada"). */
  groupLabel: string;
  /** Items resolvidos com nome (caller faz o lookup id → name). */
  items: ResolvedItem[];
  /** Remove um item específico sem fechar o popover. */
  onRemoveOne: (id: number) => void;
  /** Remove o grupo inteiro (chip desmonta). */
  onRemoveAll: () => void;
}

/**
 * Chip clicável que mostra "{groupLabel}: {primeiro} +N" e abre popover com
 * a lista vertical contendo X individual em cada item + botão "Remover todos".
 *
 * UX (alinhado a ui-ux-pro-max):
 * - aria-haspopup="dialog" + aria-expanded sincronizado com `open`.
 * - Trigger respeita touch target ≥36px (min-h-9), tap-feedback via hover/focus.
 * - Click fora ou Esc fecham o popover (default base-ui).
 * - Animação fade-in + zoom-in herdada do PopoverContent (data-open).
 * - X individual usa cor destructive no hover (mesmo padrão de AppliedFiltersChips).
 * - Lista com max-height + scroll quando há muitos items (overflow-y-auto).
 *
 * Quando `items.length` for 0 o componente retorna null (defensivo).
 * Para items.length === 1 o caller normalmente usa um chip simples; aqui ainda
 * funcionamos mostrando só o primeiro nome sem badge "+N".
 */
export function FilterChipListPopover({
  groupLabel,
  items,
  onRemoveOne,
  onRemoveAll,
}: FilterChipListPopoverProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;
  const first = items[0]!;
  const extra = items.length - 1;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-foreground transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="truncate">
              {groupLabel}: {first.name}
            </span>
            {extra > 0 ? (
              <span className="rounded-full bg-muted/80 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                +{extra}
              </span>
            ) : null}
            <ChevronDown
              className="h-3 w-3 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent align="start" sideOffset={6} className="w-56 gap-0 p-1">
        <ul role="list" className="max-h-64 overflow-y-auto">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="truncate" title={it.name}>
                {it.name}
              </span>
              <button
                type="button"
                onClick={() => onRemoveOne(it.id)}
                aria-label={`Remover ${it.name}`}
                className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1 border-t border-border pt-1">
          <button
            type="button"
            onClick={() => {
              onRemoveAll();
              setOpen(false);
            }}
            className="w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            Remover todos
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default FilterChipListPopover;
