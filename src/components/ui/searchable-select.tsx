"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchableSelectOption {
  value: string;
  label: string;
  description?: string;
  notes?: string;
  endAdornment?: ReactNode;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  className?: string;
  triggerClassName?: string;
}

/**
 * Select com busca e endAdornment.
 *
 * Usa `Popover` (base-ui) para portalizar o popup no `<body>`, evitando que
 * containers com `overflow-hidden` ou `transform` (que criam stacking context)
 * cortem ou empurrem o dropdown — bug conhecido como "dropdown preso".
 *
 * Mantém o padrão do `<CustomSelect>` (mesma família visual, sideOffset=4,
 * align="start") para consistência entre selects da plataforma.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  disabled = false,
  searchPlaceholder = "Buscar...",
  className,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.notes ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <div className={cn("relative", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              role="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              disabled={disabled}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground cursor-pointer transition-all duration-200 hover:border-muted-foreground/30 disabled:opacity-50 disabled:cursor-not-allowed",
                triggerClassName,
              )}
            >
              <span className="truncate">{selected?.label ?? placeholder}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform ml-2",
                  open && "rotate-180",
                )}
              />
            </button>
          }
        />
        <PopoverContent
          align="start"
          sideOffset={4}
          className="w-[var(--anchor-width,280px)] min-w-[280px] max-w-[min(calc(100vw-2rem),420px)] p-0 overflow-hidden"
        >
          <div className="p-2">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder={searchPlaceholder}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <ul role="listbox" className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-muted-foreground">
                Nenhum resultado
              </li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={value === opt.value}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-accent cursor-pointer",
                      value === opt.value && "bg-accent/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {opt.label}
                        </span>
                        {value === opt.value ? (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        ) : null}
                      </div>
                      {opt.notes ? (
                        <span className="block text-[11px] text-muted-foreground/80">
                          {opt.notes}
                        </span>
                      ) : null}
                    </div>
                    {opt.endAdornment ? (
                      <span className="shrink-0">{opt.endAdornment}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}
