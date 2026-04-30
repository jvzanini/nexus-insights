"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface MetaItem {
  id: number;
  name: string;
}

interface MultiSelectCheckboxProps {
  label: string;
  options: MetaItem[];
  value: number[];
  onChange: (next: number[]) => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
  /** Quando true, renderiza expandido sem popover. */
  inline?: boolean;
}

function uniq(arr: number[]): number[] {
  return Array.from(new Set(arr));
}

export function MultiSelectCheckbox({
  label,
  options,
  value,
  onChange,
  emptyLabel,
  searchPlaceholder = "Buscar...",
  inline = false,
}: MultiSelectCheckboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const total = options.length;
  const count = value.length;
  const hasQuery = query.trim().length > 0;

  // "Selecionar todos" sempre disponível; "Limpar" só quando há algo
  // selecionado. Quando há busca ativa, ambas as ações se referem aos itens
  // visíveis (pelo título do botão).
  const allTargetIds = (hasQuery ? filtered : options).map((o) => o.id);
  const allSelected =
    allTargetIds.length > 0 &&
    allTargetIds.every((id) => value.includes(id));

  const handleSelectAll = () => {
    if (allSelected) return; // já tudo marcado
    onChange(uniq([...value, ...allTargetIds]));
  };
  const handleClear = () => {
    if (count === 0) return;
    if (!hasQuery) {
      onChange([]);
      return;
    }
    const visibleIds = new Set(filtered.map((o) => o.id));
    onChange(value.filter((id) => !visibleIds.has(id)));
  };

  const toggle = (id: number) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const body = (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {label}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSelectAll}
            disabled={allSelected || allTargetIds.length === 0}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title={
              hasQuery
                ? "Selecionar somente os resultados visíveis"
                : "Selecionar todos os itens"
            }
          >
            {hasQuery ? "Selecionar visíveis" : "Selecionar todos"}
          </button>
          {count > 0 ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              title={hasQuery ? "Limpar somente visíveis" : "Limpar seleção"}
            >
              {hasQuery ? "Limpar visíveis" : "Limpar"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="px-2 py-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={searchPlaceholder}
            aria-label={`Buscar em ${label}`}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label={label}
        className="max-h-64 overflow-y-auto py-1"
      >
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {hasQuery
              ? `Nenhum resultado para "${query.trim()}"`
              : (emptyLabel ?? "Sem opções disponíveis.")}
          </p>
        ) : (
          filtered.map((opt) => {
            const checked = value.includes(opt.id);
            return (
              <label
                key={opt.id}
                aria-label={opt.name}
                role="option"
                aria-selected={checked}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                  "hover:bg-accent",
                  checked && "bg-accent/40",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(opt.id)}
                />
                <span className="truncate">{opt.name}</span>
              </label>
            );
          })
        )}
      </div>
    </>
  );

  if (inline) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/40">
        {body}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            disabled={total === 0}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`${label}: ${count} de ${total} selecionados`}
            className={cn(
              "inline-flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "data-[state=open]:bg-muted/60",
              count > 0 && "border-primary/50",
              total === 0 && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="truncate">
              <span className="text-muted-foreground">{label}</span>
              {count > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {count}
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        {body}
      </PopoverContent>
    </Popover>
  );
}
