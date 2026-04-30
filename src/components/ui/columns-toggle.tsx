"use client";

import { Columns3 } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export interface ColumnsToggleColumn {
  key: string;
  label: string;
  /** Quando true, a coluna sempre fica visível e o checkbox é desabilitado. */
  required?: boolean;
}

interface ColumnsToggleProps {
  columns: ColumnsToggleColumn[];
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Texto opcional mostrado no botão. Default: "Colunas". */
  label?: string;
  className?: string;
}

/**
 * Popover com checkboxes para alternar visibilidade de colunas em uma tabela.
 *
 * - Toques ≥ 44px (linha tem `min-h-11`).
 * - aria-pressed/aria-checked corretos via Checkbox.
 * - Atalhos no rodapé: "Selecionar todas" e "Desmarcar todas" (respeitando required).
 */
export function ColumnsToggle({
  columns,
  visible,
  onChange,
  label = "Colunas",
  className,
}: ColumnsToggleProps) {
  const visibleCount = columns.filter((c) => visible.has(c.key)).length;
  const total = columns.length;

  const toggleOne = (key: string, checked: boolean) => {
    const next = new Set(visible);
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    // Garante que required permaneçam.
    columns.forEach((c) => {
      if (c.required) next.add(c.key);
    });
    onChange(next);
  };

  const selectAll = () => {
    onChange(new Set(columns.map((c) => c.key)));
  };

  const deselectAll = () => {
    const next = new Set<string>();
    columns.forEach((c) => {
      if (c.required) next.add(c.key);
    });
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("h-9 gap-1.5", className)}
            aria-label={`${label} visíveis: ${visibleCount} de ${total}`}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span>{label}</span>
            <span
              className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground"
              aria-hidden="true"
            >
              {visibleCount}/{total}
            </span>
          </Button>
        }
      />
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-64 gap-0 p-0"
      >
        <div className="border-b border-border px-3 py-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Mostrar colunas
          </h4>
        </div>
        <ul
          className="max-h-80 overflow-y-auto py-1"
          role="group"
          aria-label="Colunas da tabela"
        >
          {columns.map((col) => {
            const checked = visible.has(col.key);
            return (
              <li key={col.key}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm transition-colors hover:bg-accent/40",
                    col.required && "cursor-not-allowed opacity-70",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={col.required}
                    onCheckedChange={(c) => toggleOne(col.key, c === true)}
                  />
                  <span className="flex-1 truncate text-foreground">
                    {col.label}
                  </span>
                  {col.required ? (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      fixa
                    </span>
                  ) : null}
                </label>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
          <button
            type="button"
            onClick={selectAll}
            className="font-medium text-primary outline-none transition-colors hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
          >
            Selecionar todas
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="font-medium text-muted-foreground outline-none transition-colors hover:text-foreground hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/50 rounded"
          >
            Desmarcar todas
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
