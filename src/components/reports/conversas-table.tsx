"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Inbox,
  X,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnsToggle,
  type ColumnsToggleColumn,
} from "@/components/ui/columns-toggle";
import { StatusBadge } from "@/components/reports/status-badge";
import { PriorityBadge } from "@/components/reports/priority-badge";
import { LabelsChips } from "@/components/reports/labels-chips";
import { ConversaDrillDown } from "@/components/reports/conversa-drill-down";
import { ConversasPagination } from "@/components/reports/conversas-pagination";
import { chatwootConversationUrl } from "@/lib/chatwoot/deep-link";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import { formatDuration } from "@/lib/utils/format-time";
import { HighlightedText } from "@/lib/utils/highlight-text";
import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";
import { useMigratedLocalStorageSet } from "@/lib/hooks/use-migrated-local-storage";
import {
  applyConditions,
  type ConditionGroup,
} from "@/lib/utils/apply-conditions";
import type { FetchConversasInput } from "@/lib/actions/reports/conversas";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { SortRule } from "@/components/reports/sorting-dialog";

interface ConversasTableProps {
  initialRows: ConversaRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  accountId: number;
  filters: FetchConversasInput["filters"];
  /** Stack de critérios de ordenação controlada pelo parent (toolbar). */
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
  /**
   * Grupo de condições do modo Avançado dos filtros. Aplicado client-side
   * sobre as rows já carregadas (não vai ao banco).
   */
  conditionGroup?: ConditionGroup;
  /**
   * Termo de busca atual (vindo do filterState.search). Usado para destacar
   * (highlight em violet) as ocorrências do termo nas colunas pesquisáveis e
   * no drill-down. Não filtra — filtragem já aconteceu no servidor.
   */
  searchTerm?: string;
}

type SortDirection = "asc" | "desc";

// v0.10.3: bumpamos para v3 com migration agressiva.
const STORAGE_COLS = "conversas-table-cols-v3";
const STORAGE_COLS_LEGACY = "conversas-table-cols-v2";
const MIGRATED_TO_DRILL_DOWN = new Set([
  "phone",
  "document",
  "labels",
  "custom_attributes",
  "created_at",
  "last_activity_at",
]);
// v0.17.0: chave do page-size foi descontinuada — limpamos no mount.
const STORAGE_PAGE_SIZE_LEGACY = "conversas-table-page-size";

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
// Botão #ID — abre conversa no Chatwoot. Substitui a antiga coluna "Ações".
// Estilo: chip outline cinza, hover roxo, focus ring violet (a11y AA).
// ----------------------------------------------------------------------------

interface OpenIdLinkProps {
  accountId: number;
  displayId: number;
  searchTerm?: string;
}

function OpenIdLink({ accountId, displayId, searchTerm }: OpenIdLinkProps) {
  const href = chatwootConversationUrl(accountId, displayId);
  return (
    <a
      data-tour="open-action"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
      title={`Abrir conversa #${displayId} no Chatwoot`}
      aria-label={`Abrir conversa #${displayId} no Chatwoot`}
      className={cn(
        "inline-flex items-center rounded-md border border-border/50 px-2 py-0.5 font-mono text-[13px] tabular-nums text-muted-foreground transition-colors",
        "hover:border-violet-500/60 hover:bg-violet-500/5 hover:text-violet-500",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-1",
      )}
    >
      <HighlightedText text={`#${displayId}`} term={searchTerm} />
    </a>
  );
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

const COLUMNS: ColumnDef[] = [
  {
    // Coluna trigger do drill-down. O ícone real é renderizado inline no body
    // (depende de expandedIds), aqui só reservamos o slot na ordem das colunas.
    key: "expand",
    label: "",
    defaultVisible: true,
    defaultOrder: -1,
    sortable: false,
    className: "w-10",
    render: () => null,
  },
  {
    key: "display_id",
    label: "#",
    defaultVisible: true,
    defaultOrder: 0,
    sortable: true,
    className: "w-20",
    compareFn: (a, b) => a.display_id - b.display_id,
    // Render do body é especial — usa <OpenIdLink>. Aqui só placeholder.
    render: () => null,
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
    key: "document",
    label: "Documento",
    defaultVisible: false,
    defaultOrder: 3,
    sortable: true,
    className: "min-w-[160px]",
    compareFn: (a, b) =>
      nullableStringCompare(
        getDocumentDisplay(a.contact),
        getDocumentDisplay(b.contact),
      ),
    render: (row) => (
      <span className="whitespace-nowrap font-mono text-[13px] text-muted-foreground tabular-nums">
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
    key: "created_at",
    label: "Criado em",
    defaultVisible: false,
    defaultOrder: 10,
    sortable: true,
    className: "min-w-[160px]",
    compareFn: (a, b) => nullableDateCompare(a.created_at, b.created_at),
    render: (row) => (
      <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
        {formatDateTime(row.created_at)}
      </span>
    ),
  },
  {
    key: "last_activity_at",
    label: "Última atualização",
    defaultVisible: false,
    defaultOrder: 11,
    sortable: true,
    className: "min-w-[170px]",
    compareFn: (a, b) =>
      nullableDateCompare(a.last_activity_at, b.last_activity_at),
    render: (row) => (
      <span className="whitespace-nowrap text-[13px] text-muted-foreground tabular-nums">
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
            "whitespace-nowrap text-[13px] font-semibold tabular-nums",
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
            "whitespace-nowrap text-[13px] font-semibold tabular-nums",
            durationTone(row.open_seconds),
          )}
        >
          {formatDuration(row.open_seconds)}
        </span>
      );
    },
  },
];

const DEFAULT_VISIBLE_KEYS = new Set(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key),
);

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

export function ConversasTable({
  initialRows,
  total,
  page,
  pageSize: _pageSize,
  totalPages,
  onPageChange,
  accountId,
  sortStack,
  onSortStackChange,
  conditionGroup,
  searchTerm,
}: ConversasTableProps) {
  const [rows, setRows] = useState<ConversaRow[]>(initialRows);
  const [pending] = useTransition();
  const currentSearchParams = useSearchParams();

  // Linhas expandidas (drill-down inline). Controle por id da conversa.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Sincroniza estado local com novo conjunto vindo do servidor (mudança de
  // período/filtros aplicada via Server Component re-render).
  useEffect(() => {
    setRows(initialRows);
    setExpandedIds(new Set());
  }, [initialRows]);

  // Cleanup transparente: chave de page-size foi descontinuada na v0.17.0.
  // Removemos pra não acumular lixo no localStorage do usuário.
  useEffect(() => {
    try {
      localStorage.removeItem(STORAGE_PAGE_SIZE_LEGACY);
    } catch {
      // ignore (Safari private mode, SSR, etc).
    }
  }, []);

  // ---- Persistências (localStorage) -----
  const [visibleCols, setVisibleCols] = useMigratedLocalStorageSet(
    STORAGE_COLS,
    STORAGE_COLS_LEGACY,
    (old) => new Set([...old].filter((k) => !MIGRATED_TO_DRILL_DOWN.has(k))),
    DEFAULT_VISIBLE_KEYS,
  );

  // ---- Cabeçalho: ordenação por click / shift+click -----
  const handleHeaderActivate = useCallback(
    (key: string, addToStack: boolean) => {
      const prev = sortStack;
      const idx = prev.findIndex((s) => s.key === key);
      let next: SortRule[];
      if (addToStack) {
        if (idx === -1) {
          next = [...prev, { key, direction: "asc" }];
        } else {
          const current = prev[idx]!;
          if (current.direction === "asc") {
            next = [...prev];
            next[idx] = { key, direction: "desc" };
          } else {
            next = prev.filter((s) => s.key !== key);
          }
        }
      } else {
        if (idx === -1 || prev.length > 1) {
          next = [{ key, direction: "asc" }];
        } else {
          const current = prev[idx]!;
          if (current.direction === "asc") {
            next = [{ key, direction: "desc" }];
          } else {
            next = [];
          }
        }
      }
      onSortStackChange(next);
    },
    [sortStack, onSortStackChange],
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

  // ---- Filtragem client-side por conditionGroup (modo Avançado) -----
  const filteredRows = useMemo(() => {
    if (
      !conditionGroup ||
      !conditionGroup.conditions ||
      conditionGroup.conditions.length === 0
    ) {
      return rows;
    }
    return applyConditions(rows, conditionGroup);
  }, [rows, conditionGroup]);

  // ---- Ordenação aplicada no client (estável). -----
  const sortedRows = useMemo(() => {
    if (sortStack.length === 0) return filteredRows;
    const cols = new Map(COLUMNS.map((c) => [c.key, c]));
    const decorated = filteredRows.map((row, idx) => ({ row, idx }));
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
  }, [filteredRows, sortStack]);

  // ---- Lista de colunas visíveis (em ordem) -----
  const orderedColumns = useMemo(
    () =>
      [...COLUMNS]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter(
          (c) =>
            c.key === "expand" ||
            c.key === "display_id" ||
            visibleCols.has(c.key),
        ),
    [visibleCols],
  );

  // ColumnsToggle só lista colunas opcionais. Removemos: expand (estrutural),
  // display_id (sempre visível como botão) e qualquer coluna com defaultOrder<0.
  const toggleColumns: ColumnsToggleColumn[] = useMemo(
    () =>
      [...COLUMNS]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter((c) => c.key !== "expand" && c.key !== "display_id")
        .map((c) => ({ key: c.key, label: c.label })),
    [],
  );

  // ---- Virtualização (desktop) -----
  // Refs/virtualizer **sempre** chamados na mesma ordem (rules of hooks);
  // o early return de empty-state acontece DEPOIS.
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 8,
    measureElement: (el) =>
      el ? el.getBoundingClientRect().height || 48 : 48,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const padTop = virtualItems[0]?.start ?? 0;
  const padBottom =
    virtualItems.length > 0
      ? totalSize - (virtualItems[virtualItems.length - 1]!.end ?? 0)
      : 0;

  // Toolbar -------------------------------------------------------------------
  // v0.23 T7: contador "Mostrando X-Y de Z" + paginação no TOPO + ColumnsToggle.
  // Removido o chip "Ordenação · N" (AppliedFiltersChips já cobre).
  // Layout flex-wrap mobile-first: em telas pequenas as 3 zonas empilham.
  const showingFrom =
    total === 0 ? 0 : (page - 1) * (_pageSize ?? 0) + 1;
  const showingTo = Math.min(page * (_pageSize ?? 0), total);
  const toolbar = (
    <div
      data-tour="pagination-top"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/10 px-3 py-2.5"
    >
      <span className="text-xs text-muted-foreground tabular-nums">
        {total === 0 ? (
          <>0 conversas</>
        ) : (
          <>
            Mostrando{" "}
            <strong className="text-foreground">
              {showingFrom.toLocaleString("pt-BR")}
              {"-"}
              {showingTo.toLocaleString("pt-BR")}
            </strong>{" "}
            de{" "}
            <strong className="text-foreground">
              {total.toLocaleString("pt-BR")}
            </strong>{" "}
            conversa{total === 1 ? "" : "s"}
          </>
        )}
      </span>
      <ConversasPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
        className="border-t-0 bg-transparent p-0"
      />
      <div data-tour="columns">
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
    const hasUrlFilters = currentSearchParams.toString().length > 0;
    return (
      <div
        id="conversas-table"
        className="rounded-2xl border border-border bg-card overflow-hidden"
      >
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
          {hasUrlFilters ? (
            <a
              href="?"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
              Limpar filtros
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  // Render principal --------------------------------------------------------
  return (
    <div
      id="conversas-table"
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {toolbar}

      {/* Desktop / large: tabela virtualizada. Container com scroll interno
          (vertical + horizontal); thead sticky usa top:0 dentro DESTE
          container. Altura calculada via dvh + vars dinâmicas. */}
      <div
        ref={parentRef}
        className={cn(
          "hidden lg:block overflow-x-auto overflow-y-auto transition-opacity duration-200",
          pending && "opacity-60",
        )}
        style={{
          maxHeight:
            "calc(100dvh - var(--page-header-h, 96px) - var(--toolbar-h, 200px) - 64px)",
        }}
        aria-busy={pending}
      >
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgb(var(--border)_/_0.6)]">
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
                      "h-11 text-[13px] uppercase tracking-wide text-muted-foreground",
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
                          "group/sort inline-flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1 -mx-1 py-1 text-[13px] font-semibold uppercase tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-primary",
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
                      <span className="sr-only">
                        {col.shortLabel ?? (col.label || col.key)}
                      </span>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {padTop > 0 ? (
              <tr aria-hidden>
                <td colSpan={orderedColumns.length} style={{ height: padTop }} />
              </tr>
            ) : null}
            {virtualItems.map((virtualRow) => {
              const row = sortedRows[virtualRow.index];
              if (!row) return null;
              const expanded = expandedIds.has(row.id);
              return (
                <Fragment key={row.id}>
                  <TableRow
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={cn(
                      "cursor-pointer hover:bg-muted/30",
                      expanded && "bg-muted/40",
                    )}
                    onClick={() => toggleExpand(row.id)}
                    aria-expanded={expanded}
                  >
                    {orderedColumns.map((col) => {
                      if (col.key === "expand") {
                        return (
                          <TableCell
                            key="expand"
                            className="w-10"
                            data-tour={
                              virtualRow.index === 0 ? "drill-down" : undefined
                            }
                          >
                            <ChevronRight
                              aria-hidden
                              className={cn(
                                "size-4 text-muted-foreground transition-transform",
                                expanded && "rotate-90 text-primary",
                              )}
                            />
                          </TableCell>
                        );
                      }
                      if (col.key === "display_id") {
                        return (
                          <TableCell
                            key={col.key}
                            className="w-20"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <OpenIdLink
                              accountId={accountId}
                              displayId={row.display_id}
                              searchTerm={searchTerm}
                            />
                          </TableCell>
                        );
                      }
                      if (col.key === "name") {
                        const name = row.contact.name ?? "—";
                        return (
                          <TableCell key={col.key}>
                            <span
                              className="block max-w-[220px] truncate text-sm font-medium text-foreground"
                              title={name}
                            >
                              <HighlightedText text={name} term={searchTerm} />
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.key === "document") {
                        const doc = getDocumentDisplay(row.contact);
                        return (
                          <TableCell key={col.key}>
                            <span className="whitespace-nowrap font-mono text-[13px] text-muted-foreground tabular-nums">
                              <HighlightedText text={doc} term={searchTerm} />
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.key === "inbox") {
                        const name = row.inbox.name ?? "—";
                        return (
                          <TableCell key={col.key}>
                            <span
                              className="block max-w-[160px] truncate text-xs text-muted-foreground"
                              title={name}
                            >
                              <HighlightedText text={name} term={searchTerm} />
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.key === "team") {
                        const name = row.team.name ?? "—";
                        return (
                          <TableCell key={col.key}>
                            <span
                              className="block max-w-[160px] truncate text-xs text-muted-foreground"
                              title={name}
                            >
                              <HighlightedText text={name} term={searchTerm} />
                            </span>
                          </TableCell>
                        );
                      }
                      if (col.key === "assignee") {
                        const name = row.assignee.name ?? "—";
                        return (
                          <TableCell key={col.key}>
                            <span
                              className="block max-w-[160px] truncate text-xs text-muted-foreground"
                              title={name}
                            >
                              <HighlightedText text={name} term={searchTerm} />
                            </span>
                          </TableCell>
                        );
                      }
                      return (
                        <TableCell
                          key={col.key}
                          className={cn(
                            col.align === "right" && "text-right",
                            col.align === "center" && "text-center",
                          )}
                        >
                          {col.render(row)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expanded ? (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="bg-muted/30 hover:bg-muted/30"
                    >
                      <TableCell
                        colSpan={orderedColumns.length}
                        className="p-0"
                      >
                        <ConversaDrillDown row={row} searchTerm={searchTerm} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
            {padBottom > 0 ? (
              <tr aria-hidden>
                <td
                  colSpan={orderedColumns.length}
                  style={{ height: padBottom }}
                />
              </tr>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: cards com scroll interno (sem virtualização — em
          mobile o scroll do navegador já é eficiente o suficiente para 10k). */}
      <ul
        className={cn(
          "lg:hidden divide-y divide-border overflow-y-auto transition-opacity duration-200",
          pending && "opacity-60",
        )}
        style={{
          maxHeight: "calc(100dvh - var(--page-header-h, 96px) - 280px)",
        }}
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
                    <OpenIdLink
                      accountId={accountId}
                      displayId={row.display_id}
                      searchTerm={searchTerm}
                    />
                  </div>
                  <h3 className="mt-1 truncate text-sm font-semibold text-foreground">
                    <HighlightedText text={contactName} term={searchTerm} />
                  </h3>
                </div>
                <StatusBadge status={row.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <Field label="WhatsApp" value={phone} mono searchTerm={searchTerm} />
                <Field label="Documento" value={doc} mono searchTerm={searchTerm} />
                <Field label="Estado" value={inboxName} searchTerm={searchTerm} />
                <Field label="Departamento" value={teamName} searchTerm={searchTerm} />
                <Field label="Atendente" value={assigneeName} searchTerm={searchTerm} />
                <div className="flex flex-col gap-0.5">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Prioridade
                  </dt>
                  <dd>
                    <PriorityBadge priority={row.priority} />
                  </dd>
                </div>
                {row.waiting_seconds != null ? (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Sem resposta há
                    </dt>
                    <dd
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
                        durationTone(row.waiting_seconds),
                      )}
                    >
                      {formatDuration(row.waiting_seconds)}
                    </dd>
                  </div>
                ) : null}
                {row.open_seconds != null ? (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Aberta há
                    </dt>
                    <dd
                      className={cn(
                        "text-[13px] font-semibold tabular-nums",
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
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
  searchTerm?: string;
}

function Field({ label, value, mono, searchTerm }: FieldProps) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-xs text-foreground/90",
          mono && "font-mono tabular-nums",
        )}
        title={value}
      >
        <HighlightedText text={value} term={searchTerm} />
      </dd>
    </div>
  );
}
