"use client";

import { useMemo, useState, useCallback, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
import {
  type SortableColumn,
  type SortableTableProps,
  type SortState,
  type SortDirection,
} from "@/components/ui/sortable-table";

export interface GroupableTableProps<T>
  extends Omit<SortableTableProps<T>, "rows"> {
  rows: T[];
  /** Key da coluna para agrupar; quando null/undefined comporta-se como SortableTable. */
  groupBy?: string | null;
  /** Renderizador customizado de label do grupo. */
  groupLabel?: (groupValue: string, count: number) => ReactNode;
  /** Default: true */
  expandable?: boolean;
  /** Default: true */
  defaultExpanded?: boolean;
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
 * Tabela com suporte a ordenação E agrupamento por coluna.
 * Quando `groupBy` está definido:
 *   - rows são agrupadas pelo `getGroupKey` da coluna correspondente
 *     (ou por `String(row[groupBy])` se `getGroupKey` não foi fornecido).
 *   - cada grupo recebe um header colapsável.
 * Quando `groupBy` é null/undefined: comporta-se como SortableTable normal.
 */
export function GroupableTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  onSortChange,
  emptyMessage = "Nenhum resultado encontrado.",
  className,
  groupBy = null,
  groupLabel,
  expandable = true,
  defaultExpanded = true,
}: GroupableTableProps<T>) {
  const isControlled = typeof onSortChange === "function";
  const [internalSort, setInternalSort] = useState<SortState | null>(
    initialSort ?? null,
  );
  const sort = isControlled ? (initialSort ?? null) : internalSort;

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  const groupCol = groupBy ? columns.find((c) => c.key === groupBy) : null;

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const getKey = (row: T): string => {
      if (groupCol?.getGroupKey) return groupCol.getGroupKey(row);
      const raw = (row as Record<string, unknown>)[groupBy];
      return raw == null ? "—" : String(raw);
    };
    const map = new Map<string, T[]>();
    for (const row of sortedRows) {
      const k = getKey(row);
      const arr = map.get(k);
      if (arr) arr.push(row);
      else map.set(k, [row]);
    }
    return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
  }, [sortedRows, groupBy, groupCol]);

  const sortStateFor = (key: string): SortDirection =>
    sort && sort.key === key ? sort.direction : null;

  const isExpanded = (groupKey: string): boolean => {
    if (!expandable) return true;
    const entry = collapsed[groupKey];
    // entry undefined → usa default; true significa "está colapsado".
    if (entry === undefined) return defaultExpanded;
    return !entry;
  };

  const toggleGroup = (groupKey: string) => {
    if (!expandable) return;
    setCollapsed((prev) => {
      const wasExpanded = isExpanded(groupKey);
      return { ...prev, [groupKey]: wasExpanded };
    });
  };

  const renderHeaderRow = () => (
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
  );

  const renderDataRow = (row: T, idx: number) => (
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
  );

  // Modo sem grupos: render flat.
  if (!groupBy || !groups) {
    return (
      <div className={cn("w-full", className)}>
        <Table>
          <TableHeader>{renderHeaderRow()}</TableHeader>
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
              sortedRows.map((row, idx) => renderDataRow(row, idx))
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      <Table>
        <TableHeader>{renderHeaderRow()}</TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            groups.map(({ key, items }) => {
              const expanded = isExpanded(key);
              const Chevron = expanded ? ChevronDown : ChevronRight;
              return (
                <GroupSection
                  key={key}
                  groupKey={key}
                  count={items.length}
                  expanded={expanded}
                  expandable={expandable}
                  Chevron={Chevron}
                  columns={columns}
                  onToggle={() => toggleGroup(key)}
                  groupLabel={groupLabel}
                >
                  {expanded && items.map((row, idx) => renderDataRow(row, idx))}
                </GroupSection>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface GroupSectionProps<T> {
  groupKey: string;
  count: number;
  expanded: boolean;
  expandable: boolean;
  Chevron: typeof ChevronDown;
  columns: SortableColumn<T>[];
  onToggle: () => void;
  groupLabel?: (groupValue: string, count: number) => ReactNode;
  children: ReactNode;
}

function GroupSection<T>({
  groupKey,
  count,
  expanded,
  expandable,
  Chevron,
  columns,
  onToggle,
  groupLabel,
  children,
}: GroupSectionProps<T>) {
  return (
    <>
      <TableRow className="bg-muted/40 hover:bg-muted/60">
        <TableCell colSpan={columns.length} className="py-2">
          {expandable ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="inline-flex w-full items-center gap-2 rounded-md px-1 -mx-1 py-0.5 text-sm font-medium text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-primary"
            >
              <Chevron aria-hidden="true" className="size-4 text-muted-foreground" />
              <span>{groupLabel ? groupLabel(groupKey, count) : groupKey}</span>
              <span className="ml-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {count}
              </span>
            </button>
          ) : (
            <span className="inline-flex w-full items-center gap-2 text-sm font-medium text-foreground">
              <span>{groupLabel ? groupLabel(groupKey, count) : groupKey}</span>
              <span className="ml-1 rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {count}
              </span>
            </span>
          )}
        </TableCell>
      </TableRow>
      {children}
    </>
  );
}
