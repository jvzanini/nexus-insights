"use client";

import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Inbox,
  Loader2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  ColumnsToggle,
  type ColumnsToggleColumn,
} from "@/components/ui/columns-toggle";
import { CustomSelect } from "@/components/ui/custom-select";
import { StatusBadge } from "@/components/reports/status-badge";
import { PriorityBadge } from "@/components/reports/priority-badge";
import { LabelsChips } from "@/components/reports/labels-chips";
import { OpenInChatwoot } from "@/components/reports/open-in-chatwoot";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import { formatDuration } from "@/lib/utils/format-time";
import {
  useLocalStorageSet,
  useLocalStorageState,
} from "@/lib/hooks/use-local-storage-state";
import {
  fetchConversas,
  type FetchConversasInput,
} from "@/lib/actions/reports/conversas";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";

interface ConversasTableProps {
  initialRows: ConversaRow[];
  initialCursor: string | null;
  accountId: number;
  filters: FetchConversasInput["filters"];
}

type SortDirection = "asc" | "desc";
interface SortRule {
  key: string;
  direction: SortDirection;
}

type PageSizeOption = "50" | "100" | "all";

const PAGE_SIZE_LIMITS: Record<PageSizeOption, number> = {
  "50": 50,
  "100": 100,
  all: 10000,
};

const STORAGE_COLS = "conversas-table-cols";
const STORAGE_PAGE_SIZE = "conversas-table-page-size";
const STORAGE_SORT = "conversas-table-sort";

// ----------------------------------------------------------------------------
// Helpers de display
// ----------------------------------------------------------------------------

function getDocumentDisplay(contact: ConversaRow["contact"]): string {
  const doc = detectDocument({
    identifier: contact.identifier,
    additional_attributes: contact.additional_attributes,
  });
  return doc?.formatted ?? "—";
}

function getPhoneDisplay(phone: string | null): string {
  if (!phone) return "—";
  return formatPhone(phone) || "—";
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Formata um valor de atributo customizado para exibição inline.
 * Escalares retornam o próprio valor (truncado em 80 chars). Objetos/arrays
 * viram placeholder com tooltip detalhado via JSON.
 */
function formatAttrValue(value: unknown): { display: string; raw: string } {
  if (value === null || value === undefined || value === "")
    return { display: "—", raw: "" };
  if (typeof value === "string") {
    const trimmed = value.length > 80 ? value.slice(0, 80) + "…" : value;
    return { display: trimmed, raw: value };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { display: String(value), raw: String(value) };
  }
  if (Array.isArray(value)) {
    return {
      display: `[${value.length} itens]`,
      raw: JSON.stringify(value),
    };
  }
  return { display: "[objeto]", raw: JSON.stringify(value) };
}

/**
 * Renderiza atributos customizados como chips compactos `chave: valor`.
 * Quando não há atributos válidos, retorna `—`.
 */
function AttributeChips({
  attrs,
}: {
  attrs: Record<string, unknown> | null;
}) {
  if (!attrs || typeof attrs !== "object") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const entries = Object.entries(attrs).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="inline-flex max-w-[320px] flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const { display, raw } = formatAttrValue(v);
        return (
          <span
            key={k}
            title={`${k}: ${raw}`}
            className="inline-flex max-w-[180px] items-center gap-1 rounded-md border border-border/40 bg-muted/40 px-1.5 py-0.5 text-[11px]"
          >
            <span className="truncate font-medium text-muted-foreground/80">
              {k}:
            </span>
            <span className="truncate text-foreground/80">{display}</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Tom semântico baseado em tempo (segundos):
 *  ≥ 1d   vermelho
 *  ≥ 4h   âmbar
 *  resto  muted
 */
function durationTone(seconds: number | null): string {
  if (seconds == null) return "text-muted-foreground";
  if (seconds >= 86400) return "text-red-500";
  if (seconds >= 14400) return "text-amber-500";
  return "text-foreground/80";
}

// ----------------------------------------------------------------------------
// Definição de colunas
// ----------------------------------------------------------------------------

interface ColumnDef {
  key: string;
  label: string;
  shortLabel?: string;
  defaultVisible: boolean;
  defaultOrder: number;
  sortable: boolean;
  className?: string;
  align?: "left" | "right" | "center";
  render: (row: ConversaRow) => ReactNode;
  compareFn?: (a: ConversaRow, b: ConversaRow) => number;
}

function nullableNumberCompare(
  a: number | null,
  b: number | null,
): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function nullableStringCompare(
  a: string | null,
  b: string | null,
): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

function dateCompare(a: string | null, b: string | null): number {
  const av = a ? new Date(a).getTime() : Number.NaN;
  const bv = b ? new Date(b).getTime() : Number.NaN;
  if (Number.isNaN(av) && Number.isNaN(bv)) return 0;
  if (Number.isNaN(av)) return 1;
  if (Number.isNaN(bv)) return -1;
  return av - bv;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "display_id",
    label: "#",
    defaultVisible: true,
    defaultOrder: 0,
    sortable: true,
    className: "w-16",
    compareFn: (a, b) => a.display_id - b.display_id,
    render: (row) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        #{row.display_id}
      </span>
    ),
  },
  {
    key: "name",
    label: "Nome",
    defaultVisible: true,
    defaultOrder: 1,
    sortable: true,
    className: "min-w-[180px]",
    compareFn: (a, b) =>
      nullableStringCompare(a.contact.name, b.contact.name),
    render: (row) => {
      const name = row.contact.name ?? "—";
      return (
        <span
          className="block max-w-[220px] truncate text-sm font-medium text-foreground"
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  {
    key: "phone",
    label: "WhatsApp",
    defaultVisible: true,
    defaultOrder: 2,
    sortable: true,
    className: "min-w-[160px]",
    compareFn: (a, b) =>
      nullableStringCompare(a.contact.phone_number, b.contact.phone_number),
    render: (row) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {getPhoneDisplay(row.contact.phone_number)}
      </span>
    ),
  },
  {
    key: "document",
    label: "Documento",
    defaultVisible: true,
    defaultOrder: 3,
    sortable: true,
    className: "min-w-[160px]",
    compareFn: (a, b) =>
      nullableStringCompare(
        getDocumentDisplay(a.contact),
        getDocumentDisplay(b.contact),
      ),
    render: (row) => (
      <span className="whitespace-nowrap font-mono text-xs text-muted-foreground tabular-nums">
        {getDocumentDisplay(row.contact)}
      </span>
    ),
  },
  {
    key: "inbox",
    label: "Estado",
    defaultVisible: true,
    defaultOrder: 4,
    sortable: true,
    className: "min-w-[140px]",
    compareFn: (a, b) =>
      nullableStringCompare(a.inbox.name, b.inbox.name),
    render: (row) => {
      const name = row.inbox.name ?? "—";
      return (
        <span
          className="block max-w-[160px] truncate text-xs text-muted-foreground"
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  {
    key: "team",
    label: "Departamento",
    defaultVisible: true,
    defaultOrder: 5,
    sortable: true,
    className: "min-w-[140px]",
    compareFn: (a, b) =>
      nullableStringCompare(a.team.name, b.team.name),
    render: (row) => {
      const name = row.team.name ?? "—";
      return (
        <span
          className="block max-w-[160px] truncate text-xs text-muted-foreground"
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  {
    key: "assignee",
    label: "Atendente",
    defaultVisible: true,
    defaultOrder: 6,
    sortable: true,
    className: "min-w-[140px]",
    compareFn: (a, b) =>
      nullableStringCompare(a.assignee.name, b.assignee.name),
    render: (row) => {
      const name = row.assignee.name ?? "—";
      return (
        <span
          className="block max-w-[160px] truncate text-xs text-muted-foreground"
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  {
    key: "status",
    label: "Status",
    defaultVisible: true,
    defaultOrder: 7,
    sortable: true,
    className: "min-w-[120px]",
    compareFn: (a, b) => a.status - b.status,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    key: "priority",
    label: "Prioridade",
    defaultVisible: true,
    defaultOrder: 8,
    sortable: true,
    className: "min-w-[120px]",
    compareFn: (a, b) =>
      nullableNumberCompare(a.priority, b.priority),
    render: (row) => <PriorityBadge priority={row.priority} />,
  },
  {
    key: "labels",
    label: "Labels",
    defaultVisible: true,
    defaultOrder: 9,
    sortable: false,
    className: "min-w-[160px]",
    render: (row) => <LabelsChips labels={row.labels} />,
  },
  {
    key: "created_at",
    label: "Criado em",
    defaultVisible: false,
    defaultOrder: 10,
    sortable: true,
    className: "min-w-[160px]",
    compareFn: (a, b) => dateCompare(a.created_at, b.created_at),
    render: (row) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
  {
    key: "last_activity_at",
    label: "Última atualização",
    defaultVisible: true,
    defaultOrder: 11,
    sortable: true,
    className: "min-w-[170px]",
    compareFn: (a, b) =>
      dateCompare(a.last_activity_at, b.last_activity_at),
    render: (row) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.last_activity_at)}
      </span>
    ),
  },
  {
    key: "waiting_seconds",
    label: "Sem resposta há",
    shortLabel: "Sem resposta",
    defaultVisible: true,
    defaultOrder: 12,
    sortable: true,
    className: "min-w-[140px]",
    compareFn: (a, b) =>
      nullableNumberCompare(a.waiting_seconds, b.waiting_seconds),
    render: (row) => {
      if (row.waiting_seconds == null) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <span
          className={cn(
            "whitespace-nowrap text-xs font-semibold tabular-nums",
            durationTone(row.waiting_seconds),
          )}
        >
          {formatDuration(row.waiting_seconds)}
        </span>
      );
    },
  },
  {
    key: "open_seconds",
    label: "Aberta há",
    defaultVisible: true,
    defaultOrder: 13,
    sortable: true,
    className: "min-w-[140px]",
    compareFn: (a, b) =>
      nullableNumberCompare(a.open_seconds, b.open_seconds),
    render: (row) => {
      if (row.open_seconds == null) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <span
          className={cn(
            "whitespace-nowrap text-xs font-semibold tabular-nums",
            durationTone(row.open_seconds),
          )}
        >
          {formatDuration(row.open_seconds)}
        </span>
      );
    },
  },
  {
    key: "custom_attributes",
    label: "Atributos",
    defaultVisible: true,
    defaultOrder: 14,
    sortable: false,
    className: "min-w-[200px]",
    render: (row) => <AttributeChips attrs={row.custom_attributes} />,
  },
];

/**
 * Factory das colunas. O `accountId` é injetado em runtime para que a coluna
 * de Ações renderize `<OpenInChatwoot>` direto via `render`, sem precisar de
 * branches no body da tabela.
 */
function buildColumns(accountId: number): ColumnDef[] {
  return [
    ...COLUMNS,
    {
      key: "actions",
      label: "Ações",
      defaultVisible: true,
      defaultOrder: 99,
      sortable: false,
      className: "w-24",
      align: "right",
      render: (row) => (
        <OpenInChatwoot accountId={accountId} displayId={row.display_id} />
      ),
    },
  ];
}

const DEFAULT_VISIBLE_KEYS = new Set([
  ...COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
  "actions",
]);

// ----------------------------------------------------------------------------
// Indicador de ordenação (com índice em multi-sort)
// ----------------------------------------------------------------------------

interface SortHeaderIconProps {
  direction: SortDirection | null;
  index?: number;
  total: number;
}

function SortHeaderIcon({ direction, index, total }: SortHeaderIconProps) {
  const Icon =
    direction === "asc"
      ? ChevronUp
      : direction === "desc"
        ? ChevronDown
        : ChevronsUpDown;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3 shrink-0 transition-opacity",
          direction === null ? "opacity-40" : "opacity-100 text-primary",
        )}
      />
      {direction !== null && total > 1 && index !== undefined ? (
        <span
          aria-hidden="true"
          className="rounded-full bg-primary/15 px-1 text-[9px] font-bold leading-tight text-primary tabular-nums"
        >
          {index}
        </span>
      ) : null}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Tabela
// ----------------------------------------------------------------------------

const PAGE_SIZE_OPTIONS = [
  { value: "50", label: "50 por página" },
  { value: "100", label: "100 por página" },
  { value: "all", label: "Todos" },
];

export function ConversasTable({
  initialRows,
  initialCursor,
  accountId,
  filters,
}: ConversasTableProps) {
  const [rows, setRows] = useState<ConversaRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ---- Persistências (localStorage) -----
  const [visibleCols, setVisibleCols] = useLocalStorageSet(
    STORAGE_COLS,
    DEFAULT_VISIBLE_KEYS,
  );
  const [pageSize, setPageSize] = useLocalStorageState<PageSizeOption>(
    STORAGE_PAGE_SIZE,
    "50",
  );
  const [sortStack, setSortStack] = useLocalStorageState<SortRule[]>(
    STORAGE_SORT,
    [],
  );

  // ---- Cabeçalho: ordenação por click / shift+click -----
  const handleHeaderActivate = useCallback(
    (key: string, addToStack: boolean) => {
      setSortStack((prev) => {
        const idx = prev.findIndex((s) => s.key === key);
        if (addToStack) {
          // shift+click: adiciona / alterna direção dentro da pilha existente.
          if (idx === -1) {
            return [...prev, { key, direction: "asc" }];
          }
          const current = prev[idx]!;
          if (current.direction === "asc") {
            const next = [...prev];
            next[idx] = { key, direction: "desc" };
            return next;
          }
          // estava desc → remove da pilha (mantém os outros critérios).
          return prev.filter((s) => s.key !== key);
        }
        // click normal: substitui a pilha.
        if (idx === -1 || prev.length > 1) {
          return [{ key, direction: "asc" }];
        }
        const current = prev[idx]!;
        if (current.direction === "asc") {
          return [{ key, direction: "desc" }];
        }
        return [];
      });
    },
    [setSortStack],
  );

  const onHeaderClick =
    (key: string, sortable: boolean) =>
    (e: MouseEvent<HTMLButtonElement>) => {
      if (!sortable) return;
      handleHeaderActivate(key, e.shiftKey);
    };

  const onHeaderKey =
    (key: string, sortable: boolean) =>
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (!sortable) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleHeaderActivate(key, e.shiftKey);
      }
    };

  // ---- Colunas computadas (factory por accountId) -----
  const allColumns = useMemo(() => buildColumns(accountId), [accountId]);

  // ---- Ordenação aplicada no client (estável). -----
  const sortedRows = useMemo(() => {
    if (sortStack.length === 0) return rows;
    const cols = new Map(allColumns.map((c) => [c.key, c]));
    const decorated = rows.map((row, idx) => ({ row, idx }));
    decorated.sort((A, B) => {
      for (const rule of sortStack) {
        const col = cols.get(rule.key);
        if (!col?.compareFn) continue;
        const factor = rule.direction === "asc" ? 1 : -1;
        const diff = col.compareFn(A.row, B.row) * factor;
        if (diff !== 0) return diff;
      }
      return A.idx - B.idx; // estabilidade.
    });
    return decorated.map((d) => d.row);
  }, [rows, sortStack, allColumns]);

  // ---- Carregar mais -----
  const loadMore = () => {
    if (!cursor || pending) return;
    setError(null);
    const limit = PAGE_SIZE_LIMITS[pageSize];
    startTransition(async () => {
      const result = await fetchConversas({
        filters,
        cursor,
        accountId,
        limit,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows((prev) => [...prev, ...result.rows]);
      setCursor(result.nextCursor);
    });
  };

  // ---- Reset / refetch ao trocar pageSize ----
  const handlePageSizeChange = (next: string) => {
    if (next !== "50" && next !== "100" && next !== "all") return;
    if (next === pageSize) return;
    setPageSize(next);
    setError(null);
    const limit = PAGE_SIZE_LIMITS[next];
    startTransition(async () => {
      const result = await fetchConversas({
        filters,
        cursor: null,
        accountId,
        limit,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      // se "Todos", a query trouxe tudo (até MAX) — esconde "carregar mais".
      setCursor(next === "all" ? null : result.nextCursor);
    });
  };

  const clearSort = () => setSortStack([]);

  // ---- Lista de colunas visíveis (em ordem) -----
  const orderedColumns = useMemo(
    () =>
      [...allColumns]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter((c) => visibleCols.has(c.key)),
    [visibleCols, allColumns],
  );

  const toggleColumns: ColumnsToggleColumn[] = useMemo(
    () =>
      [...allColumns]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter((c) => c.key !== "actions")
        .map((c) => ({ key: c.key, label: c.label })),
    [allColumns],
  );

  // Toolbar -------------------------------------------------------------------
  const toolbar = (
    <div className="flex flex-col gap-3 border-b border-border bg-muted/10 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{rows.length}</span>{" "}
          conversa{rows.length === 1 ? "" : "s"}
        </span>
        {sortStack.length > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={clearSort}
            className="h-7 gap-1 text-[11px]"
            aria-label="Limpar ordenação"
          >
            <X className="h-3 w-3" />
            Limpar ordenação
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary tabular-nums">
              {sortStack.length}
            </span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect
          value={pageSize}
          onChange={handlePageSizeChange}
          options={PAGE_SIZE_OPTIONS}
          className="min-w-[160px]"
          triggerClassName="h-9 text-xs"
        />
        <ColumnsToggle
          columns={toggleColumns}
          visible={visibleCols}
          onChange={setVisibleCols}
        />
      </div>
    </div>
  );

  // Empty state -------------------------------------------------------------
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {toolbar}
        <div className="bg-muted/20 p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted/40">
            <Inbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            Nenhuma conversa encontrada
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Ajuste os filtros para ver mais resultados.
          </p>
        </div>
      </div>
    );
  }

  // Render principal --------------------------------------------------------
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {toolbar}

      {/* Desktop / large: tabela. */}
      <div
        className={cn(
          "hidden lg:block overflow-x-auto transition-opacity duration-200",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {orderedColumns.map((col) => {
                const ruleIdx = sortStack.findIndex((s) => s.key === col.key);
                const rule = ruleIdx >= 0 ? sortStack[ruleIdx] : null;
                const direction = rule?.direction ?? null;
                const ariaSort: "ascending" | "descending" | "none" =
                  !col.sortable
                    ? "none"
                    : direction === "asc"
                      ? "ascending"
                      : direction === "desc"
                        ? "descending"
                        : "none";
                return (
                  <TableHead
                    key={col.key}
                    aria-sort={ariaSort}
                    className={cn(
                      "h-11 text-xs uppercase tracking-wide text-muted-foreground",
                      col.className,
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={onHeaderClick(col.key, col.sortable)}
                        onKeyDown={onHeaderKey(col.key, col.sortable)}
                        className={cn(
                          "group/sort inline-flex w-full items-center gap-1.5 rounded-md px-1 -mx-1 py-1 text-xs font-semibold uppercase tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-primary",
                          col.align === "right" && "justify-end text-right",
                          col.align === "center" && "justify-center",
                        )}
                        title="Click para ordenar · Shift+click para multi-sort"
                      >
                        <span>{col.shortLabel ?? col.label}</span>
                        <SortHeaderIcon
                          direction={direction}
                          index={ruleIdx >= 0 ? ruleIdx + 1 : undefined}
                          total={sortStack.length}
                        />
                      </button>
                    ) : (
                      <span>{col.shortLabel ?? col.label}</span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, idx) => (
              <TableRow
                key={row.id}
                className="hover:bg-muted/30 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
                style={{
                  animationDelay: `${Math.min(idx, 16) * 15}ms`,
                }}
              >
                {orderedColumns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: cards. */}
      <ul
        className={cn(
          "lg:hidden divide-y divide-border transition-opacity duration-200",
          pending && "opacity-60",
        )}
        aria-busy={pending}
      >
        {sortedRows.map((row) => {
          const phone = getPhoneDisplay(row.contact.phone_number);
          const doc = getDocumentDisplay(row.contact);
          const inboxName = row.inbox.name ?? "—";
          const teamName = row.team.name ?? "—";
          const assigneeName = row.assignee.name ?? "—";
          const contactName = row.contact.name ?? "—";

          return (
            <li
              key={row.id}
              className="p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      #{row.display_id}
                    </span>
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                    {contactName}
                  </h3>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="WhatsApp" value={phone} mono />
                <Field label="Documento" value={doc} mono />
                <Field label="Estado" value={inboxName} />
                <Field label="Departamento" value={teamName} />
                <Field label="Atendente" value={assigneeName} />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Prioridade
                  </dt>
                  <dd>
                    <PriorityBadge priority={row.priority} />
                  </dd>
                </div>
                {row.waiting_seconds != null ? (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Sem resposta há
                    </dt>
                    <dd
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        durationTone(row.waiting_seconds),
                      )}
                    >
                      {formatDuration(row.waiting_seconds)}
                    </dd>
                  </div>
                ) : null}
                {row.open_seconds != null ? (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Aberta há
                    </dt>
                    <dd
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        durationTone(row.open_seconds),
                      )}
                    >
                      {formatDuration(row.open_seconds)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-3 flex items-center justify-between gap-3">
                <LabelsChips labels={row.labels} />
                <OpenInChatwoot
                  accountId={accountId}
                  displayId={row.display_id}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer: error + carregar mais. */}
      {(cursor || error) && (
        <div className="border-t border-border p-3 flex items-center justify-center gap-3 bg-muted/10">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : null}
          {cursor ? (
            <Button
              variant="outline"
              size="sm"
              onClick={loadMore}
              disabled={pending}
              className="h-9"
            >
              {pending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando...
                </>
              ) : (
                "Carregar mais"
              )}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

function Field({ label, value, mono }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-xs text-foreground/90",
          mono && "font-mono tabular-nums",
        )}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
