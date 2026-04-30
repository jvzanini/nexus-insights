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
import { ConversaDrillDown } from "@/components/reports/conversa-drill-down";
import { formatPhone } from "@/lib/utils/format-phone";
import { detectDocument } from "@/lib/utils/format-document";
import { formatDuration } from "@/lib/utils/format-time";
import {
  nullableNumberCompare,
  nullableStringCompare,
  nullableDateCompare,
} from "@/lib/utils/null-compare";
import { useLocalStorageState } from "@/lib/hooks/use-local-storage-state";
import { useMigratedLocalStorageSet } from "@/lib/hooks/use-migrated-local-storage";
import {
  applyConditions,
  type ConditionGroup,
} from "@/lib/utils/apply-conditions";
import {
  fetchConversas,
  type FetchConversasInput,
} from "@/lib/actions/reports/conversas";
import type { ConversaRow } from "@/lib/chatwoot/queries/conversas-list";
import type { SortRule } from "@/components/reports/sorting-dialog";

interface ConversasTableProps {
  initialRows: ConversaRow[];
  initialCursor: string | null;
  accountId: number;
  filters: FetchConversasInput["filters"];
  /** Stack de critérios de ordenação controlada pelo parent (toolbar). */
  sortStack: SortRule[];
  onSortStackChange: (next: SortRule[]) => void;
  /**
   * Grupo de condições do modo Avançado dos filtros. Aplicado client-side
   * sobre as rows já paginadas (não vai ao banco). Tipo separado de
   * `ReportFilters` para não vazar contrato server-side.
   */
  conditionGroup?: ConditionGroup;
}

type SortDirection = "asc" | "desc";

type PageSizeOption = "100" | "all";

const PAGE_SIZE_LIMITS: Record<PageSizeOption, number> = {
  "100": 100,
  all: 10000,
};

// v0.10.3: bumpamos para v3 com migration agressiva — independentemente do
// que o usuário tinha customizado depois da v0.9.0, phone/custom_attributes/
// document/labels nunca devem voltar ao default da grade. Quem quiser pode
// reativar via <ColumnsToggle>.
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
const STORAGE_PAGE_SIZE = "conversas-table-page-size";
// STORAGE_SORT: persistência da ordenação foi promovida ao parent
// (ConversasPageClient) para permitir cabeamento bidirecional com o
// <SortingDialog> exibido no toolbar.

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
    className: "w-16",
    compareFn: (a, b) => a.display_id - b.display_id,
    render: (row) => (
      <span className="font-mono text-[13px] text-muted-foreground tabular-nums">
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
    key: "labels",
    label: "Etiquetas",
    defaultVisible: false,
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
  { value: "100", label: "100 por página" },
  { value: "all", label: "Todos" },
];

// ----------------------------------------------------------------------------
// Sentinela de infinite scroll
// ----------------------------------------------------------------------------

/**
 * Renderiza uma `<tr>` invisível ao final do `<tbody>` que dispara `onIntersect`
 * quando entra (ou se aproxima de 200px) do viewport do container scroll.
 * Auto-desliga via `disabled` para evitar fetches duplicados enquanto pendente
 * ou quando não há mais cursor.
 */
function InfiniteScrollSentinel({
  onIntersect,
  disabled,
}: {
  onIntersect: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (disabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersect();
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disabled, onIntersect]);
  return (
    <tr ref={ref} aria-hidden="true">
      <td colSpan={99} className="h-1 p-0" />
    </tr>
  );
}

export function ConversasTable({
  initialRows,
  initialCursor,
  accountId,
  filters,
  sortStack,
  onSortStackChange,
  conditionGroup,
}: ConversasTableProps) {
  const [rows, setRows] = useState<ConversaRow[]>(initialRows);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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
  // período/filtros aplicada via Server Component re-render). Sem isso, `rows`
  // e `cursor` ficam stale após o primeiro render — daí o sintoma de "todos os
  // períodos mostram a mesma quantidade" e o "Carregar mais" sumir.
  useEffect(() => {
    setRows(initialRows);
    setCursor(initialCursor);
    setError(null);
    setExpandedIds(new Set());
  }, [initialRows, initialCursor]);

  // ---- Persistências (localStorage) -----
  const [visibleCols, setVisibleCols] = useMigratedLocalStorageSet(
    STORAGE_COLS,
    STORAGE_COLS_LEGACY,
    (old) => new Set([...old].filter((k) => !MIGRATED_TO_DRILL_DOWN.has(k))),
    DEFAULT_VISIBLE_KEYS,
  );
  const [pageSize, setPageSize] = useLocalStorageState<PageSizeOption>(
    STORAGE_PAGE_SIZE,
    "100",
  );

  // Migração transparente: usuários que tinham "50" persistido em localStorage
  // (default da v0.10.3) são rebaixados para "100" — opção "50" foi removida.
  useEffect(() => {
    if ((pageSize as string) === "50") setPageSize("100");
  }, [pageSize, setPageSize]);

  // ---- Cabeçalho: ordenação por click / shift+click -----
  // sortStack agora é controlado pelo parent (ConversasPageClient) — o hook de
  // localStorage vive lá, garantindo cabeamento bidirecional com o
  // <SortingDialog> exibido no toolbar.
  const handleHeaderActivate = useCallback(
    (key: string, addToStack: boolean) => {
      const prev = sortStack;
      const idx = prev.findIndex((s) => s.key === key);
      let next: SortRule[];
      if (addToStack) {
        // shift+click: adiciona / alterna direção dentro da pilha existente.
        if (idx === -1) {
          next = [...prev, { key, direction: "asc" }];
        } else {
          const current = prev[idx]!;
          if (current.direction === "asc") {
            next = [...prev];
            next[idx] = { key, direction: "desc" };
          } else {
            // estava desc → remove da pilha (mantém os outros critérios).
            next = prev.filter((s) => s.key !== key);
          }
        }
      } else {
        // click normal: substitui a pilha.
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

  // ---- Colunas computadas (factory por accountId) -----
  const allColumns = useMemo(() => buildColumns(accountId), [accountId]);

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
    const cols = new Map(allColumns.map((c) => [c.key, c]));
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
  }, [filteredRows, sortStack, allColumns]);

  // ---- Carregar mais -----
  const loadMore = useCallback(() => {
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
  }, [cursor, pending, pageSize, filters, accountId]);

  // ---- Reset / refetch ao trocar pageSize ----
  const handlePageSizeChange = (next: string) => {
    if (next !== "100" && next !== "all") return;
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

  const clearSort = () => onSortStackChange([]);

  // ---- Lista de colunas visíveis (em ordem) -----
  const orderedColumns = useMemo(
    () =>
      [...allColumns]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter((c) => c.key === "expand" || visibleCols.has(c.key)),
    [visibleCols, allColumns],
  );

  const toggleColumns: ColumnsToggleColumn[] = useMemo(
    () =>
      [...allColumns]
        .sort((a, b) => a.defaultOrder - b.defaultOrder)
        .filter((c) => c.key !== "actions" && c.key !== "expand")
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
            title="Click no cabeçalho ordena · Shift+click adiciona critério"
          >
            <X className="h-3 w-3" />
            Ordenação
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary tabular-nums">
              {sortStack.length}
            </span>
          </Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div data-tour="page-size">
          <CustomSelect
            value={pageSize}
            onChange={handlePageSizeChange}
            options={PAGE_SIZE_OPTIONS}
            className="min-w-[160px]"
            triggerClassName="h-9 text-xs"
          />
        </div>
        <div data-tour="columns">
          <ColumnsToggle
            columns={toggleColumns}
            visible={visibleCols}
            onChange={setVisibleCols}
          />
        </div>
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

      {/* Desktop / large: tabela. Container com scroll interno (vertical +
          horizontal); thead sticky usa top:0 dentro DESTE container. Altura
          calculada via dvh + vars dinâmicas medidas no <PageHeader> e no
          <AdvancedFilters>. */}
      <div
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
          <TableHeader
            className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_rgb(var(--border)_/_0.6)]"
          >
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
                          "group/sort inline-flex w-full items-center gap-1.5 rounded-md px-1 -mx-1 py-1 text-[13px] font-semibold uppercase tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:text-primary",
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
            {sortedRows.map((row, idx) => {
              const expanded = expandedIds.has(row.id);
              return (
                <Fragment key={row.id}>
                  <TableRow
                    className={cn(
                      "cursor-pointer hover:bg-muted/30 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150",
                      expanded && "bg-muted/40",
                    )}
                    style={{
                      animationDelay: `${Math.min(idx, 16) * 15}ms`,
                    }}
                    onClick={() => toggleExpand(row.id)}
                    aria-expanded={expanded}
                  >
                    {orderedColumns.map((col) => {
                      if (col.key === "expand") {
                        return (
                          <TableCell
                            key="expand"
                            className="w-10"
                            data-tour={idx === 0 ? "drill-down" : undefined}
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
                      // A célula de Ações tem botão real — interrompe a
                      // propagação para que o click não toggle o drill-down.
                      const stopProp = col.key === "actions";
                      return (
                        <TableCell
                          key={col.key}
                          onClick={
                            stopProp ? (e) => e.stopPropagation() : undefined
                          }
                          className={cn(
                            col.align === "right" && "text-right",
                            col.align === "center" && "text-center",
                          )}
                          data-tour={
                            col.key === "actions" && idx === 0
                              ? "open-action"
                              : undefined
                          }
                        >
                          {col.render(row)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expanded ? (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell
                        colSpan={orderedColumns.length}
                        className="p-0"
                      >
                        <ConversaDrillDown row={row} accountId={accountId} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
            {/* Sentinela: dispara loadMore via IntersectionObserver enquanto há
                cursor e pageSize="100". Em "all" o cursor é null → não monta. */}
            {cursor && pageSize === "100" ? (
              <InfiniteScrollSentinel
                onIntersect={loadMore}
                disabled={pending}
              />
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* Mobile / tablet: cards com scroll interno. Em viewports menores não
          há toolbar lateral, então a fórmula desconta apenas o page header e
          o toolbar interno (~280px de chrome estimado). */}
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
                <OpenInChatwoot
                  accountId={accountId}
                  displayId={row.display_id}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Footer: erro + fallback "Carregar mais". O botão só aparece se a
          sentinela não está ativa (i.e. `pageSize !== "100"` ou houve erro).
          Em "100" sem erro, o IntersectionObserver cuida do load. Em "all" o
          cursor já é null e o footer some naturalmente. */}
      {(cursor || error) && (
        <div className="border-t border-border p-3 flex items-center justify-center gap-3 bg-muted/10">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : null}
          {cursor && (pageSize !== "100" || error) ? (
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
        {value}
      </dd>
    </div>
  );
}
