"use client";

import { useMemo, useState, useCallback, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortIndicator } from "@/components/ui/sort-indicator";

export type SortDirection = "asc" | "desc" | null;

export interface SortableColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "center" | "right";
  /** Tailwind class de largura, ex: "w-32" */
  width?: string;
  hideOnMobile?: boolean;
  render: (row: T) => ReactNode;
  /**
   * Comparador customizado para esta coluna. Se ausente, usamos
   * comparação default por `row[key]` (string/number/Date).
   */
  compareFn?: (a: T, b: T) => number;
  /** Usado pelo GroupableTable para extrair a chave de agrupamento. */
  getGroupKey?: (row: T) => string;
}

export interface SortState {
  key: string;
  direction: Exclude<SortDirection, null>;
}

export interface SortableTableProps<T> {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  initialSort?: SortState;
  /**
   * Quando definido, o componente fica em modo controlado (notifica a
   * cada mudança e NÃO ordena internamente). Quando ausente, o estado
   * de sort é interno e a ordenação é aplicada localmente.
   */
  onSortChange?: (sort: SortState | null) => void;
  emptyMessage?: ReactNode;
  className?: string;
}

const ALIGN_CLASS: Record<NonNullable<SortableColumn<unknown>["align"]>, string> = {
  left: "text-left justify-start",
  center: "text-center justify-center",
  right: "text-right justify-end",
};

function defaultCompare<T>(a: T, b: T, key: string): number {
  const av = (a as Record<string, unknown>)[key];
  const bv = (b as Record<string, unknown>)[key];
  if (av === bv) return 0;
  if (av == null) return -1;
  if (bv == null) return 1;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
  return String(av).localeCompare(String(bv), "pt-BR", { numeric: true });
}

/**
 * Tabela com ordenação por coluna, indicadores visuais e a11y completa.
 *
 * - Click no header de coluna sortable: cycle null → asc → desc → null.
 * - Click em coluna diferente: muda key e direction = "asc".
 * - `onSortChange` definido → modo controlado (parent ordena).
 * - `onSortChange` ausente → ordenação interna.
 * - Mobile: colunas com `hideOnMobile` ficam escondidas em < md.
 * - aria-sort no <th>, Tab/Enter/Space funcionam.
 * - Stagger sutil de entrada via CSS animation (sem JS frame loop).
 */
export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  onSortChange,
  emptyMessage = "Nenhum resultado encontrado.",
  className,
}: SortableTableProps<T>) {
  const isControlled = typeof onSortChange === "function";
  const [internalSort, setInternalSort] = useState<SortState | null>(
    initialSort ?? null,
  );

  const sort = isControlled ? (initialSort ?? null) : internalSort;

  const handleHeaderActivate = useCallback(
    (col: SortableColumn<T>) => {
      if (!col.sortable) return;
      const next: SortState | null =
        sort && sort.key === col.key
          ? sort.direction === "asc"
            ? { key: col.key, direction: "desc" }
            : null
          : { key: col.key, direction: "asc" };

      if (isControlled) {
        onSortChange?.(next);
      } else {
        setInternalSort(next);
      }
    },
    [sort, isControlled, onSortChange],
  );

  const sortedRows = useMemo<T[]>(() => {
    if (isControlled) return rows;
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const cmp =
      col.compareFn ?? ((a: T, b: T) => defaultCompare(a, b, sort.key));
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => cmp(a, b) * factor);
  }, [rows, sort, columns, isControlled]);

  const sortStateFor = (key: string): SortDirection =>
    sort && sort.key === key ? sort.direction : null;

  return (
    <div className={cn("w-full", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const state = sortStateFor(col.key);
              const ariaSort: "ascending" | "descending" | "none" = !col.sortable
                ? "none"
                : state === "asc"
                  ? "ascending"
                  : state === "desc"
                    ? "descending"
                    : "none";
              return (
                <TableHead
                  key={col.key}
                  aria-sort={ariaSort}
                  className={cn(
                    col.width,
                    col.hideOnMobile && "hidden md:table-cell",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleHeaderActivate(col)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleHeaderActivate(col);
                        }
                      }}
                      className={cn(
                        "group/sort inline-flex w-full items-center gap-1.5 rounded-md px-1 -mx-1 py-0.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-primary",
                        ALIGN_CLASS[col.align ?? "left"],
                      )}
                    >
                      <span>{col.label}</span>
                      <SortIndicator state={state} />
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex w-full items-center gap-1.5",
                        ALIGN_CLASS[col.align ?? "left"],
                      )}
                    >
                      {col.label}
                    </span>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            sortedRows.map((row, idx) => (
              <TableRow
                key={rowKey(row)}
                className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
                style={{ animationDelay: `${Math.min(idx, 20) * 30}ms` }}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.hideOnMobile && "hidden md:table-cell",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
